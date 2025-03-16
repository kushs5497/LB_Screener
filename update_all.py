#!/usr/bin/env python3
import os
import sys
import time
import logging
import pandas as pd
import re
import requests
from typing import Dict, List, Tuple, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm import tqdm
from pathlib import Path
from io import StringIO

# Import our custom modules
from add_to_town_index import AddToTownIndex
from get_addresses import GetAddress

class GetName:
    """
    Class to handle retrieval of names and addresses from web API sources.
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

    def create_payload(self, last_name: str, wippid: str = "23") -> str:
        """
        Create API payload for the request.
        
        Args:
            last_name: Last name to search for
            wippid: WIPP ID for the request
            
        Returns:
            Formatted payload string
        """
        return f'7|0|9|https://wipp.edmundsassoc.com/Wipp/wipp/|6097249917502855D47FCE321E6AF9E1|wipp.client.WippService|taxOwnerNameSearch|java.lang.String/2004016611|Z|{wippid}|{last_name}||1|2|3|4|4|5|5|5|6|7|8|9|1|'

    def fetch_data(self, last_name: str, wippid: str = "23") -> str:
        """
        Send API request to fetch data.
        
        Args:
            last_name: Last name to search for
            wippid: WIPP ID for the request
            
        Returns:
            API response text or None if request failed
        """
        url = "https://wipp.edmundsassoc.com/Wipp/wipp/wipp"
        headers = {
            "Content-Type": "text/x-gwt-rpc; charset=UTF-8",
            "User-Agent": "Mozilla/5.0",
            "Origin": "https://wipp.edmundsassoc.com",
            "Referer": f"https://wipp.edmundsassoc.com/Wipp/?wippid={wippid}",
            "X-GWT-Module-Base": "https://wipp.edmundsassoc.com/Wipp/wipp/",
            "X-GWT-Permutation": "6097249917502855D47FCE321E6AF9E1",
            "Accept-Encoding": "gzip, deflate, br"
        }
        
        payload = self.create_payload(last_name, wippid)
        
        try:
            response = requests.post(url, data=payload, headers=headers)
            response.raise_for_status()
            return response.text
        except requests.exceptions.RequestException as e:
            self.logger.warning(f"Error fetching {last_name}: {str(e)}")
            return None

    def parse_response(self, response: str, last_name: str, municipality: str) -> List[Dict]:
        """
        Parse API response to extract names and addresses.
        
        Args:
            response: API response text
            last_name: Last name that was searched
            municipality: Municipality name
            
        Returns:
            List of dictionaries containing name and address information
        """
        if not response:
            return []
            
        try:
            # Extract the list part (inside square brackets)
            match = re.search(r'\["java.util.ArrayList/4159755760","java.lang.String/2004016611",(.*)]', response)
            if not match:
                self.logger.warning(f"No valid data found for {last_name}")
                return []
            
            raw_data = match.group(1)
            
            # Use a regex pattern to correctly extract quoted values, handling embedded commas
            pattern = r'"([^"]*?)"'
            extracted_data = re.findall(pattern, raw_data)

            # Group data into (Full Name, Address, Extra Info)
            parsed_data = []
            for i in range(0, len(extracted_data), 3):
                if i + 2 < len(extracted_data):
                    full_name = extracted_data[i].strip().replace('\\x26','')
                    address = extracted_data[i + 1].strip()
                    extra_info = extracted_data[i + 2].strip()
                    
                    # Only include if last name is in full name
                    if last_name.lower() in full_name.lower():
                        parsed_data.append({
                            "Owner Name": full_name,
                            "Property Location": address,
                            "Municipality": municipality,
                            "Search": last_name
                        })

            return parsed_data
        except Exception as e:
            self.logger.error(f"Error parsing response for {last_name}: {str(e)}")
            return []

    def process_town(self, county: str, row: pd.Series, index: int, 
                     last_names_to_itr: pd.Series) -> Tuple[str, List[Dict]]:
        """
        Process a town to get names and addresses using API.
        
        Args:
            county: County name
            row: Row from links DataFrame containing town info
            index: Index number for progress display
            last_names_to_itr: Series of last names to iterate through
            
        Returns:
            Tuple of (town name, list of address dictionaries)
        """
        municipality = row['Municipality']
        wippid = row.get('Wippid', "23")  # Default to 23 if not specified
        
        # Create description for progress bar
        description = f'{municipality} {index} of {self.links_df.shape[0]}'
        spaces = ' ' * (35 - len(description))
        
        data = []
        
        try:
            for name in tqdm(last_names_to_itr, desc=f'{description}{spaces}'):
                if not name.strip():
                    continue
                    
                self.logger.debug(f"Fetching data for {name} in {municipality}")
                response = self.fetch_data(name, wippid)
                
                if response:
                    results = self.parse_response(response, name, municipality)
                    data.extend(results)
                    
                    # Break if no data is coming back, no need to keep trying more names
                    if not results and len(data) > 0:
                        self.logger.warning(f'No more results for {county}/{municipality}/{name}')
                        break

            # Create DataFrame from collected data
            df = pd.DataFrame(data)
            
            if not df.empty:
                # Create county directory if it doesn't exist
                county_dir = os.path.join(self.data_output_dir, county)
                os.makedirs(county_dir, exist_ok=True)
                
                # Save data to CSV file
                csv_path = os.path.join(county_dir, f"{municipality}.csv")
                df.to_csv(csv_path, index=False)
                
                self.logger.info(f'Completed {municipality} with {len(data)} records')
            else:
                self.logger.warning(f'No data found for {municipality}')
                
            return municipality, data
        except Exception as e:
            self.logger.error(f'Error processing {municipality}: {str(e)}')
            return municipality, []

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
