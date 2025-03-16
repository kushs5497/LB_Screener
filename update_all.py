#!/usr/bin/env python3
import os
import sys
import time
import logging
import pandas as pd
from typing import Dict, List, Tuple, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import selenium_functions as sf
from tqdm import tqdm
from pathlib import Path
import requests
from io import StringIO
import json
import base64
from googleapiclient.discovery import build
from google.oauth2 import service_account
from google.oauth2.service_account import Credentials
import re

# Import our custom modules
from add_to_town_index import AddToTownIndex
from get_addresses import GetAddress

class GoogleSheetsUploader:
    """
    Class to handle Google Sheets operations.
    """
    
    def __init__(self):
        """Initialize the GoogleSheetsUploader class."""
        self.logger = logging.getLogger("GoogleSheetsUploader")
        self.spreadsheet_id = os.environ.get('SPREADSHEET_ID')
        self.client_email = os.environ.get('CLIENT_EMAIL')
        self.private_key = os.environ.get('PRIVATE_KEY')
        
        if not all([self.spreadsheet_id, self.client_email, self.private_key]):
            self.logger.error("Missing required environment variables for Google Sheets integration")
            self.enabled = False
        else:
            self.enabled = True
            self.private_key = self.private_key.replace('\\n', '\n')
            self.service = self.authorize_google_sheets()
    
    def authorize_google_sheets(self) -> Optional[Any]:
        """
        Authorize with Google Sheets API using service account credentials.
        
        Returns:
            Authorized Google Sheets service object or None if authorization fails
        """
        try:
            credentials_dict = {
                "type": "service_account",
                "project_id": "town-data-project",
                "private_key_id": "private_key_id",  # This is not actually used by the client
                "private_key": self.private_key,
                "client_email": self.client_email,
                "client_id": "client_id",  # This is not actually used by the client
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{self.client_email.replace('@', '%40')}"
            }
            
            credentials = service_account.Credentials.from_service_account_info(
                credentials_dict, 
                scopes=['https://www.googleapis.com/auth/spreadsheets']
            )
            
            service = build('sheets', 'v4', credentials=credentials)
            self.logger.info("Successfully authenticated with Google Sheets API")
            return service
        except Exception as e:
            self.logger.error(f"Failed to authenticate with Google Sheets API: {str(e)}")
            return None

    def get_all_sheets(self) -> List[str]:
        """
        Get all sheet names from the spreadsheet.
        
        Returns:
            List of sheet names
        """
        if not self.enabled or not self.service:
            return []
            
        try:
            sheet_metadata = self.service.spreadsheets().get(spreadsheetId=self.spreadsheet_id).execute()
            sheets = sheet_metadata.get('sheets', [])
            return [sheet['properties']['title'] for sheet in sheets]
        except Exception as e:
            self.logger.error(f"Failed to get sheet names: {str(e)}")
            return []

    def create_sheet(self, sheet_name: str) -> bool:
        """
        Create a new sheet in the spreadsheet.
        
        Args:
            sheet_name: Name of the sheet to create
            
        Returns:
            True if creation was successful, False otherwise
        """
        if not self.enabled or not self.service:
            return False
            
        try:
            # Clean the sheet name to ensure it's valid
            clean_sheet_name = re.sub(r'[\\*?:/[\]]', '', sheet_name)
            if clean_sheet_name != sheet_name:
                self.logger.warning(f"Sheet name contains invalid characters. Using '{clean_sheet_name}' instead of '{sheet_name}'")
                sheet_name = clean_sheet_name
                
            # Check if sheet name is longer than 100 characters (Google Sheets limit)
            if len(sheet_name) > 100:
                sheet_name = sheet_name[:97] + "..."
                self.logger.warning(f"Sheet name too long. Truncated to '{sheet_name}'")
                
            request_body = {
                'requests': [{
                    'addSheet': {
                        'properties': {
                            'title': sheet_name
                        }
                    }
                }]
            }
            
            self.service.spreadsheets().batchUpdate(
                spreadsheetId=self.spreadsheet_id,
                body=request_body
            ).execute()
            
            self.logger.info(f"Successfully created sheet: {sheet_name}")
            return True
        except Exception as e:
            self.logger.error(f"Failed to create sheet {sheet_name}: {str(e)}")
            return False

    def upload_data(self, sheet_name: str, data: pd.DataFrame) -> bool:
        """
        Upload data to a specific sheet.
        
        Args:
            sheet_name: Name of the sheet to upload data to
            data: DataFrame containing the data to upload
            
        Returns:
            True if upload was successful, False otherwise
        """
        if not self.enabled or not self.service:
            return False
            
        try:
            # Convert DataFrame to list of lists (including header)
            values = [data.columns.tolist()] + data.values.tolist()
            
            # Clear existing data in the sheet first
            self.service.spreadsheets().values().clear(
                spreadsheetId=self.spreadsheet_id,
                range=f"{sheet_name}!A1:Z",
                body={}
            ).execute()
            
            # Update the sheet with new data
            result = self.service.spreadsheets().values().update(
                spreadsheetId=self.spreadsheet_id,
                range=f"{sheet_name}!A1",
                valueInputOption="RAW",
                body={"values": values}
            ).execute()
            
            updated_cells = result.get('updatedCells')
            self.logger.info(f"Successfully uploaded {updated_cells} cells to sheet: {sheet_name}")
            return True
        except Exception as e:
            self.logger.error(f"Failed to upload data to sheet {sheet_name}: {str(e)}")
            return False

    def create_sheet_if_not_exists_and_upload(self, county: str, town: str, data: pd.DataFrame) -> bool:
        """
        Check if a sheet exists, create it if not, and upload data.
        
        Args:
            county: County name for organizational purposes
            town: Town name (which will be the sheet name)
            data: DataFrame containing the data to upload
            
        Returns:
            True if the process was successful, False otherwise
        """
        if not self.enabled or not self.service:
            self.logger.warning("Google Sheets integration is not enabled or failed to initialize")
            return False
            
        try:
            # First, ensure the County List sheet exists and contains this county
            all_sheets = self.get_all_sheets()
            
            # Check if County List sheet exists, create it if not
            if "County List" not in all_sheets:
                self.logger.info("Creating 'County List' sheet")
                self.create_sheet("County List")
                # Add county to the list
                self.service.spreadsheets().values().update(
                    spreadsheetId=self.spreadsheet_id,
                    range="County List!A1",
                    valueInputOption="RAW",
                    body={"values": [[county]]}
                ).execute()
            else:
                # Check if county is in the list, add it if not
                result = self.service.spreadsheets().values().get(
                    spreadsheetId=self.spreadsheet_id,
                    range="County List!A:A"
                ).execute()
                
                values = result.get('values', [])
                counties = [row[0] for row in values if row]
                
                if county not in counties:
                    self.logger.info(f"Adding county '{county}' to County List")
                    self.service.spreadsheets().values().append(
                        spreadsheetId=self.spreadsheet_id,
                        range="County List!A:A",
                        valueInputOption="RAW",
                        body={"values": [[county]]}
                    ).execute()
            
            # Now check for county sheet
            county_sheet_name = county
            if county_sheet_name not in all_sheets:
                self.logger.info(f"Creating county sheet: {county_sheet_name}")
                self.create_sheet(county_sheet_name)
                # Add header and town
                self.service.spreadsheets().values().update(
                    spreadsheetId=self.spreadsheet_id,
                    range=f"{county_sheet_name}!A1",
                    valueInputOption="RAW",
                    body={"values": [["Town"], [town]]}
                ).execute()
            else:
                # Check if town is in this county's sheet, add it if not
                result = self.service.spreadsheets().values().get(
                    spreadsheetId=self.spreadsheet_id,
                    range=f"{county_sheet_name}!A:A"
                ).execute()
                
                values = result.get('values', [])
                towns = [row[0] for row in values[1:] if row]  # Skip header
                
                if town not in towns:
                    self.logger.info(f"Adding town '{town}' to {county} sheet")
                    self.service.spreadsheets().values().append(
                        spreadsheetId=self.spreadsheet_id,
                        range=f"{county_sheet_name}!A:A",
                        valueInputOption="RAW",
                        body={"values": [[town]]}
                    ).execute()
            
            # Finally, handle the town data sheet
            town_sheet_name = town
            if town_sheet_name not in all_sheets:
                self.logger.info(f"Creating town sheet: {town_sheet_name}")
                self.create_sheet(town_sheet_name)
            
            # Upload data to the town sheet
            return self.upload_data(town_sheet_name, data)
            
        except Exception as e:
            self.logger.error(f"Error in create_sheet_if_not_exists_and_upload for {county}/{town}: {str(e)}")
            return False


class GetName:
    """
    Class to handle retrieval of names and addresses from web sources.
    """
    
    def __init__(self, links_excel: str = "links.xlsx", 
                 data_output_dir: str = "Data_By_Towns",
                 max_workers: int = None):
        """
        Initialize the GetName class.
        
        Args:
            links_excel: Path to the Excel file containing links
            data_output_dir: Directory to store output data
            max_workers: Maximum number of worker threads
        """
        self.links_excel = links_excel
        self.data_output_dir = data_output_dir
        self.max_workers = max_workers or os.cpu_count()
        self.logger = self._setup_logger()
        self.sheets_uploader = GoogleSheetsUploader()
        
        # Ensure the output directory exists
        os.makedirs(self.data_output_dir, exist_ok=True)

    def _setup_logger(self) -> logging.Logger:
        """Set up and return a logger for this class."""
        logger = logging.getLogger("GetName")
        logger.setLevel(logging.INFO)
        
        # Create handlers if they don't exist
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            handler.setFormatter(formatter)
            logger.addHandler(handler)
            
            # Also log to file
            file_handler = logging.FileHandler('name_retrieval.log')
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
            
        return logger

    def get_last_names(self) -> pd.Series:
        """
        Fetch the list of last names from Google Sheets.
        
        Returns:
            Series containing last names
        """
        url = 'https://docs.google.com/spreadsheets/d/1yQ-LfAp9KOCq74p9xWGBWNt4fUvsMctUy9bLYCgvrJI/export?format=csv'
        try:
            response = requests.get(url)
            response.raise_for_status()
            last_names = pd.read_csv(StringIO(response.text))
            last_name_list = 'Full List'
            last_names_to_itr = last_names[last_name_list][last_names[last_name_list].notna()]
            self.logger.info(f"Successfully fetched {len(last_names_to_itr)} last names")
            return last_names_to_itr
        except Exception as e:
            self.logger.error(f"Failed to fetch last names: {str(e)}")
            return pd.Series()

    def process_town(self, county: str, row: pd.Series, index: int, 
                     last_names_to_itr: pd.Series) -> Tuple[str, List[Dict]]:
        """
        Process a town to get names and addresses.
        
        Args:
            county: County name
            row: Row from links DataFrame containing town info
            index: Index number for progress display
            last_names_to_itr: Series of last names to iterate through
            
        Returns:
            Tuple of (town name, list of address dictionaries)
        """
        driver = sf.web_driver()
        data = []
        municipality = row['Municipality']
        
        # Create description for progress bar
        description = f'{municipality} {index} of {self.links_df.shape[0]}'
        spaces = ' ' * (35 - len(description))
        
        try:
            for name in tqdm(last_names_to_itr, desc=f'{description}{spaces}'):
                search_results = sf.search_lastname_town(row['Municipality'], row['Link'], name, data, driver)
                if search_results is None: 
                    self.logger.warning(f'No results found for {county}/{row["Municipality"]}/{name}')
                    break
                data = search_results

            # Create DataFrame from collected data
            df = pd.DataFrame(data, columns=["Owner Name", "Property Location", "Municipality", "Search"])
            
            # Create county directory if it doesn't exist
            county_dir = os.path.join(self.data_output_dir, county)
            os.makedirs(county_dir, exist_ok=True)
            
            # Save data to CSV file
            csv_path = os.path.join(county_dir, f"{row['Municipality']}.csv")
            df.to_csv(csv_path, index=False)
            
            # Upload data to Google Sheets
            if self.sheets_uploader.enabled:
                self.logger.info(f"Uploading {municipality} data to Google Sheets")
                success = self.sheets_uploader.create_sheet_if_not_exists_and_upload(county, municipality, df)
                if success:
                    self.logger.info(f"Successfully uploaded {municipality} data to Google Sheets")
                else:
                    self.logger.warning(f"Failed to upload {municipality} data to Google Sheets")
            
            self.logger.info(f'Completed {row["Municipality"]} with {len(data)} records')
            return municipality, data
        except Exception as e:
            self.logger.error(f'Error processing {municipality}: {str(e)}')
            return municipality, []
        finally:
            driver.quit()

    def get_towns_data(self, county: str) -> Dict[str, List[Dict]]:
        """
        Get data for all towns in a county.
        
        Args:
            county: County name
            
        Returns:
            Dictionary mapping town names to their address data
        """
        try:
            links_path = f'Links_By_County/{county}.xlsx'
            self.links_df = pd.read_excel(links_path)
        except FileNotFoundError:
            self.logger.error(f'No links file found for {county}')
            return {}
        
        self.logger.info(f'Processing county: {county} with {len(self.links_df)} towns')
        
        towns_data = {}
        last_names_to_itr = self.get_last_names()
        
        if last_names_to_itr.empty:
            self.logger.error("Failed to retrieve last names, aborting")
            return {}
        
        self.logger.info(f"Running with {self.max_workers} threads")
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = [
                executor.submit(self.process_town, county, row, index, last_names_to_itr) 
                for index, row in self.links_df.iterrows()
            ]

            for future in as_completed(futures):
                try:
                    town_name, town_data = future.result()
                    towns_data[town_name] = town_data
                except Exception as e:
                    self.logger.error(f"Error processing town: {str(e)}")
        
        return towns_data

    def process_counties(self, counties: List[str] = None) -> Dict[str, Dict[str, List[Dict]]]:
        """
        Process multiple counties to get names and addresses.
        
        Args:
            counties: List of county names to process, if None, all counties from links.xlsx will be processed
            
        Returns:
            Dictionary mapping counties to town data dictionaries
        """
        if counties is None:
            # Get all counties from links.xlsx
            try:
                counties_list = pd.read_excel(self.links_excel, header=0)['County'].unique()
                self.logger.info(f"Processing all {len(counties_list)} counties")
            except Exception as e:
                self.logger.error(f"Failed to get counties from links.xlsx: {str(e)}")
                return {}
        else:
            counties_list = counties
            self.logger.info(f"Processing {len(counties_list)} specified counties")
        
        all_data = {}
        for county in counties_list:
            start_time = time.time()
            self.logger.info(f"Starting processing for county: {county}")
            
            towns_data = self.get_towns_data(county)
            all_data[county] = towns_data
            
            end_time = time.time()
            processing_time = end_time - start_time
            self.logger.info(f"Completed {county} in {processing_time:.2f} seconds")
        
        return all_data


class GetAddress:
    """
    Class to handle address processing.
    """
    
    def __init__(self, data_output_dir: str = "Data_By_Towns"):
        """
        Initialize the GetAddress class.
        
        Args:
            data_output_dir: Directory containing town data
        """
        self.data_output_dir = data_output_dir
        self.logger = logging.getLogger("GetAddress")
        self.sheets_uploader = GoogleSheetsUploader()
    
    def process_county_data(self, county: str, towns_data: Dict[str, List[Dict]]) -> None:
        """
        Process address data for all towns in a county.
        
        Args:
            county: County name
            towns_data: Dictionary mapping town names to their address data
        """
        for town, addresses in towns_data.items():
            if not addresses:
                self.logger.warning(f"No address data for {town} in {county}, skipping")
                continue
                
            self.logger.info(f"Processing addresses for {town} in {county}")
            
            try:
                # Convert address dictionaries to DataFrame
                df = pd.DataFrame(addresses)
                
                # Process addresses (add code here to validate/geocode addresses)
                # For now, just ensure required columns are present
                required_columns = ["Owner Name", "Property Location", "Municipality"]
                for col in required_columns:
                    if col not in df.columns:
                        self.logger.warning(f"Missing required column {col} for {town}")
                        df[col] = ""
                
                # Rename columns to match expected structure
                column_mapping = {
                    "Owner Name": "Name",
                    "Property Location": "Address"
                }
                df = df.rename(columns=column_mapping)
                
                # Add required columns for the Town Data structure
                if "City" not in df.columns:
                    df["City"] = town
                if "State" not in df.columns:
                    df["State"] = "NJ"  # Assuming New Jersey
                if "Zip" not in df.columns:
                    df["Zip"] = ""
                if "Longitude" not in df.columns:
                    df["Longitude"] = ""
                if "Latitude" not in df.columns:
                    df["Latitude"] = ""
                if "ID" not in df.columns:
                    df["ID"] = ""
                if "Notes" not in df.columns:
                    df["Notes"] = ""
                
                # Reorder columns to match expected structure
                ordered_columns = [
                    "Name", "Address", "City", "State", "Zip", 
                    "Longitude", "Latitude", "ID", "Notes"
                ]
                df = df[ordered_columns]
                
                # Save processed data
                county_dir = os.path.join("Data_By_Towns_Index", county)
                os.makedirs(county_dir, exist_ok=True)
                
                # Save to CSV
                csv_path = os.path.join(county_dir, f"{town}.csv")
                df.to_csv(csv_path, index=False)
                
                # Save to Excel
                excel_path = os.path.join(county_dir, f"{town}.xlsx")
                df.to_excel(excel_path, index=False)
                
                # Upload processed data to Google Sheets
                if self.sheets_uploader.enabled:
                    self.logger.info(f"Uploading processed data for {town} to Google Sheets")
                    success = self.sheets_uploader.create_sheet_if_not_exists_and_upload(county, town, df)
                    if success:
                        self.logger.info(f"Successfully uploaded processed data for {town} to Google Sheets")
                    else:
                        self.logger.warning(f"Failed to upload processed data for {town} to Google Sheets")
                
                self.logger.info(f"Completed processing {len(df)} addresses for {town}")
                
            except Exception as e:
                self.logger.error(f"Error processing addresses for {town}: {str(e)}")


def main():
    """Main function to orchestrate the entire workflow."""
    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('update_all.log'),
            logging.StreamHandler()
        ]
    )
    logger = logging.getLogger("UpdateAll")
    
    start_time = time.time()
    logger.info("Starting full update process")
    
    try:
        # Step 1: Initialize GetName class to fetch names and addresses
        name_fetcher = GetName()
        
        # Step 2: Initialize GetAddress class to validate and process addresses
        address_processor = GetAddress()
        
        # Step 3: Process counties (either all or a specified list)
        counties_to_process = ["Burlington", "Camden"]  # Example: specify counties or use None for all
        
        counties_data = name_fetcher.process_counties(counties_to_process)
        
        # Step 4: For each county and town, process addresses
        for county, towns_data in counties_data.items():
            logger.info(f"Processing addresses for county: {county}")
            
            if not towns_data:
                logger.warning(f"No town data found for {county}, skipping")
                continue
                
            # Process addresses for each town in the county
            address_processor.process_county_data(county, towns_data)
            
        logger.info("Update process completed successfully")
        
    except Exception as e:
        logger.error(f"Error during update process: {str(e)}")
        
    end_time = time.time()
    total_time = end_time - start_time
    logger.info(f"Total processing time: {total_time:.2f} seconds")


if __name__ == "__main__":
    main()
