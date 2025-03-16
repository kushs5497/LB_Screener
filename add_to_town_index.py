import os
import pandas as pd
import shutil
import logging
from pathlib import Path
from typing import List, Dict, Optional, Tuple

class AddToTownIndex:
    """
    Class to manage the addition of addresses to town index folders.
    Handles checking if addresses exist in PID and adds new addresses to respective town folders.
    """
    
    def __init__(self, pid_path: str = 'pid_table.csv', 
                 data_dir: str = 'public/files/Data_By_Towns_Index'):
        """
        Initialize the AddToTownIndex class.
        
        Args:
            pid_path: Path to the PID table CSV file
            data_dir: Directory where town data is stored
        """
        self.pid_path = pid_path
        self.data_dir = data_dir
        self.logger = self._setup_logger()
        
        # Ensure the data directory exists
        os.makedirs(self.data_dir, exist_ok=True)
        
        # Load PID data if the file exists
        if os.path.exists(self.pid_path):
            try:
                self.pid_data = pd.read_csv(self.pid_path)
                self.logger.info(f"Loaded PID data from {self.pid_path}")
            except Exception as e:
                self.pid_data = pd.DataFrame()
                self.logger.error(f"Failed to load PID data: {str(e)}")
        else:
            self.pid_data = pd.DataFrame()
            self.logger.warning(f"PID file {self.pid_path} not found. Using empty DataFrame.")

    def _setup_logger(self) -> logging.Logger:
        """Set up and return a logger for this class."""
        logger = logging.getLogger("AddToTownIndex")
        logger.setLevel(logging.INFO)
        
        # Create handlers if they don't exist
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            handler.setFormatter(formatter)
            logger.addHandler(handler)
            
            # Also log to file
            file_handler = logging.FileHandler('town_index.log')
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
            
        return logger

    def check_if_town_in_pid(self, county: str, town: str, 
                             addresses: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
        """
        Check if addresses for a specific town exist in the PID data.
        
        Args:
            county: County name
            town: Town name
            addresses: List of address dictionaries to check
            
        Returns:
            Tuple of (existing_addresses, new_addresses)
        """
        if self.pid_data.empty:
            self.logger.warning("PID data is empty, all addresses will be considered new.")
            return [], addresses
        
        existing_addresses = []
        new_addresses = []
        
        for address in addresses:
            # Extract address information
            property_location = address.get('Property Location', '')
            owner_name = address.get('Owner Name', '')
            
            # Check if the address exists in PID data
            # Adjust the condition based on actual PID data structure
            matching_rows = self.pid_data[
                (self.pid_data['Property Location'].str.lower() == property_location.lower()) &
                (self.pid_data['County'].str.lower() == county.lower()) &
                (self.pid_data['Municipality'].str.lower() == town.lower())
            ]
            
            if not matching_rows.empty:
                existing_addresses.append(address)
            else:
                new_addresses.append(address)
                
        self.logger.info(f"{county}/{town}: Found {len(existing_addresses)} existing and {len(new_addresses)} new addresses")
        return existing_addresses, new_addresses

    def add_new_addy(self, county: str, town: str, addresses: List[Dict]) -> bool:
        """
        Add new addresses to the respective town folder.
        
        Args:
            county: County name
            town: Town name
            addresses: List of address dictionaries to add
            
        Returns:
            Boolean indicating success
        """
        if not addresses:
            self.logger.info(f"No new addresses to add for {county}/{town}")
            return True
            
        # Ensure the county directory exists
        county_dir = os.path.join(self.data_dir, county)
        os.makedirs(county_dir, exist_ok=True)
        
        # Path to the town file
        town_file = os.path.join(county_dir, f"{town}.xlsx")
        
        try:
            # Create or update the town file
            if os.path.exists(town_file):
                # Load existing data
                existing_df = pd.read_excel(town_file)
                
                # Create DataFrame from new addresses
                new_df = pd.DataFrame(addresses)
                
                # Merge with existing data, avoiding duplicates
                if set(existing_df.columns) == set(new_df.columns):
                    # Use all columns to identify duplicates
                    merged_df = pd.concat([existing_df, new_df]).drop_duplicates()
                else:
                    # If columns don't match, use some common columns for deduplication
                    common_cols = list(set(existing_df.columns) & set(new_df.columns))
                    if common_cols:
                        merged_df = pd.concat([existing_df, new_df])
                        merged_df = merged_df.drop_duplicates(subset=common_cols)
                    else:
                        # If no common columns, just concatenate
                        merged_df = pd.concat([existing_df, new_df])
                
                merged_df.to_excel(town_file, index=False)
                self.logger.info(f"Updated {town_file} with {len(addresses)} new addresses")
            else:
                # Create new file
                pd.DataFrame(addresses).to_excel(town_file, index=False)
                self.logger.info(f"Created {town_file} with {len(addresses)} addresses")
            
            # Update PID data with new addresses
            self._update_pid_data(county, town, addresses)
            
            return True
        except Exception as e:
            self.logger.error(f"Failed to add addresses to {town_file}: {str(e)}")
            return False

    def _update_pid_data(self, county: str, town: str, addresses: List[Dict]) -> None:
        """Update the PID data with new addresses."""
        if self.pid_data.empty and os.path.exists(self.pid_path):
            try:
                self.pid_data = pd.read_csv(self.pid_path)
            except Exception:
                self.pid_data = pd.DataFrame()
        
        if self.pid_data.empty:
            # Create a new PID DataFrame with necessary columns
            columns = ['County', 'Municipality', 'Property Location', 'Owner Name']
            self.pid_data = pd.DataFrame(columns=columns)
        
        # Prepare new data for PID
        new_pid_records = []
        for address in addresses:
            record = {
                'County': county,
                'Municipality': town,
                'Property Location': address.get('Property Location', ''),
                'Owner Name': address.get('Owner Name', '')
                # Add other fields as necessary
            }
            new_pid_records.append(record)
        
        # Add to PID data
        new_pid_df = pd.DataFrame(new_pid_records)
        self.pid_data = pd.concat([self.pid_data, new_pid_df]).drop_duplicates()
        
        # Save updated PID data
        try:
            self.pid_data.to_csv(self.pid_path, index=False)
            self.logger.info(f"Updated PID data in {self.pid_path}")
        except Exception as e:
            self.logger.error(f"Failed to update PID data: {str(e)}")

    def process_county(self, county: str, towns_data: Dict[str, List[Dict]]) -> None:
        """
        Process all towns in a county.
        
        Args:
            county: County name
            towns_data: Dictionary mapping town names to their address data
        """
        self.logger.info(f"Processing {len(towns_data)} towns in {county}")
        
        for town, addresses in towns_data.items():
            self.logger.info(f"Processing {town} with {len(addresses)} addresses")
            
            # Check which addresses are new
            _, new_addresses = self.check_if_town_in_pid(county, town, addresses)
            
            # Add new addresses to town index
            if new_addresses:
                success = self.add_new_addy(county, town, new_addresses)
                if success:
                    self.logger.info(f"Successfully added {len(new_addresses)} addresses to {county}/{town}")
                else:
                    self.logger.error(f"Failed to add addresses to {county}/{town}")
            else:
                self.logger.info(f"No new addresses to add for {county}/{town}")
