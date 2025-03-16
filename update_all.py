#!/usr/bin/env python3
import os
import sys
import time
import logging
import pandas as pd
from typing import Dict, List, Tuple, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
import selenium_functions as sf
from tqdm import tqdm
from pathlib import Path
import requests
from io import StringIO

# Import our custom modules
from add_to_town_index import AddToTownIndex
from get_addresses import GetAddress

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
