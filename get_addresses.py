import os
import pandas as pd
import logging
from typing import List, Dict, Optional, Tuple
from add_to_town_index import AddToTownIndex

class GetAddress:
    """
    Class to handle validation and retrieval of addresses.
    Checks if addresses exist in PID data and processes new addresses.
    """
    
    def __init__(self, pid_path: str = 'pid_table.csv', 
                 data_dir: str = 'public/files/Data_By_Towns_Index'):
        """
        Initialize the GetAddress class.
        
        Args:
            pid_path: Path to the PID table CSV file
            data_dir: Directory where town data is stored
        """
        self.pid_path = pid_path
        self.data_dir = data_dir
        self.logger = self._setup_logger()
        
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
        
        # Initialize the AddToTownIndex instance
        self.town_indexer = AddToTownIndex(pid_path, data_dir)

    def _setup_logger(self) -> logging.Logger:
        """Set up and return a logger for this class."""
        logger = logging.getLogger("GetAddress")
        logger.setLevel(logging.INFO)
        
        # Create handlers if they don't exist
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            handler.setFormatter(formatter)
            logger.addHandler(handler)
            
            # Also log to file
            file_handler = logging.FileHandler('address_processing.log')
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
            
        return logger

    def check_town_exists(self, county: str, town: str) -> bool:
        """
        Check if a town exists in the PID data.
        
        Args:
            county: County name
            town: Town name
            
        Returns:
            Boolean indicating if the town exists
        """
        if self.pid_data.empty:
            self.logger.warning(f"PID data is empty, cannot verify if {county}/{town} exists")
            return False
        
        town_exists = ((self.pid_data['County'].str.lower() == county.lower()) & 
                        (self.pid_data['Municipality'].str.lower() == town.lower())).any()
        
        if town_exists:
            self.logger.info(f"Town {county}/{town} found in PID data")
        else:
            self.logger.info(f"Town {county}/{town} not found in PID data")
            
        return town_exists

    def process_addresses(self, county: str, town: str, addresses: List[Dict]) -> None:
        """
        Process addresses for a specific town.
        
        Args:
            county: County name
            town: Town name
            addresses: List of address dictionaries to process
        """
        self.logger.info(f"Processing {len(addresses)} addresses for {county}/{town}")
        
        # Use the AddToTownIndex instance to check which addresses are new
        existing_addresses, new_addresses = self.town_indexer.check_if_town_in_pid(
            county, town, addresses
        )
        
        self.logger.info(f"{county}/{town}: {len(existing_addresses)} existing, {len(new_addresses)} new addresses")
        
        # Add new addresses to the town index
        if new_addresses:
            success = self.town_indexer.add_new_addy(county, town, new_addresses)
            if success:
                self.logger.info(f"Successfully added {len(new_addresses)} addresses to {county}/{town}")
            else:
                self.logger.error(f"Failed to add addresses to {county}/{town}")
        else:
            self.logger.info(f"No new addresses to add for {county}/{town}")

    def process_county_data(self, county: str, towns_data: Dict[str, List[Dict]]) -> None:
        """
        Process all towns in a county.
        
        Args:
            county: County name
            towns_data: Dictionary mapping town names to their address data
        """
        self.logger.info(f"Processing {len(towns_data)} towns in {county}")
        
        # Use the town_indexer to process all towns in the county
        self.town_indexer.process_county(county, towns_data)
        
    def get_new_addresses(self, county: str, town: str, source_data: List[Dict]) -> List[Dict]:
        """
        Identify and return new addresses that don't exist in the PID.
        
        Args:
            county: County name
            town: Town name
            source_data: Source data containing addresses to check
            
        Returns:
            List of new addresses not in PID
        """
        self.logger.info(f"Identifying new addresses for {county}/{town}")
        
        _, new_addresses = self.town_indexer.check_if_town_in_pid(county, town, source_data)
        
        self.logger.info(f"Found {len(new_addresses)} new addresses for {county}/{town}")
        return new_addresses

    def update_pid_with_new_addresses(self, new_addresses: List[Dict], county: str, town: str) -> None:
        """
        Update the PID data with new addresses.
        
        Args:
            new_addresses: List of new address dictionaries
            county: County name
            town: Town name
        """
        if not new_addresses:
            self.logger.info(f"No new addresses to update for {county}/{town}")
            return
            
        self.logger.info(f"Updating PID data with {len(new_addresses)} new addresses for {county}/{town}")
        
        # Add new addresses to the town index, which will also update the PID
        self.town_indexer.add_new_addy(county, town, new_addresses)
