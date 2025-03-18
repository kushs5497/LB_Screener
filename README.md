# LB Screener

## Overview

LB Screener is a specialized tool designed to search and screen public records for addresses in New Jersey that meet specific criteria (such as matching last names). The application automates the process of scanning NETRonline records, extracts relevant address information, and visualizes the results on an interactive mapping interface developed using Node.js, JavaScript, and HTML.

## Technical Features

- **Web Scraping Engine**: Built with Python's Selenium to automate browsing and extract data from NETRonline public records
- **Data Processing Pipeline**: Utilizes Python scripts and Jupyter notebooks for data cleaning, transformation, and validation
- **Geolocation Integration**: Converts addresses to geographical coordinates (latitude/longitude) for accurate mapping
- **Interactive Mapping Interface**: Custom-built visualization tool using JavaScript and HTML
- **Server-Side Processing**: Node.js backend server to handle requests and serve the web application
- **Automated Workflows**: Scripts for updating and maintaining the address database

## Installation

### Prerequisites
- Python 3.7+
- Node.js 14+ and npm
- Google Chrome (for Selenium WebDriver)
- Git

### Setup Instructions

1. Clone the repository:
```bash
git clone https://github.com/yourusername/lb-screener.git
cd lb-screener
```

2. Install Python dependencies:
```bash
pip install -r requirements.txt
```

3. Install Node.js dependencies:
```bash
npm install
```

4. Configure Chrome WebDriver (required for Selenium):
   - Download the appropriate version of ChromeDriver for your Chrome version
   - Add the ChromeDriver executable to your system PATH or place it in the project root directory

## Usage

### Searching for Addresses

1. Start the server:
```bash
node server.js
```

2. Access the web interface at http://localhost:3000 in your browser

3. To perform a search for addresses based on criteria:
```bash
python get_addresses.py --criteria "lastname" --value "Smith"
```

### Updating Address Database

To refresh the address database with the latest records:
```bash
python update_all.py
```

### Converting Addresses to Coordinates

To geocode addresses and prepare them for mapping:
```bash
python get_lat_lng.py
```

### Generating County Border Data

To update the county border information for the map overlay:
```bash
python get_county_borders.py
```

## File Structure

- **Python Scripts**:
  - `get_addresses.py`: Main script for scraping addresses from NETRonline
  - `get_links.py`: Extracts relevant links from the search results
  - `get_names.py`: Extracts name information from property records
  - `get_lat_lng.py`: Converts addresses to geographical coordinates
  - `get_county_borders.py`: Retrieves and processes county border information
  - `selenium_functions.py`: Helper functions for web scraping operations
  - `update_all.py`: Comprehensive update script for refreshing the database

- **Jupyter Notebooks**:
  - Various `.ipynb` files for data analysis, transformation, and visualization

- **Web Application**:
  - `server.js`: Node.js server for the web application
  - `public/`: Directory containing frontend assets (HTML, CSS, JavaScript)

- **Data Files**:
  - `links.xlsx`: Excel file containing scraped links
  - Various CSV files storing processed address and coordinate data

## API Reference

### Python Functions

#### `selenium_functions.py`
Contains core functionality for web scraping operations, including:
- Browser initialization
- Page navigation
- Element extraction
- Error handling

### Node.js Server

The server provides the following endpoints:
- `GET /`: Serves the main mapping interface
- `GET /api/addresses`: Returns JSON data of all processed addresses
- `GET /api/addresses/:criteria`: Returns filtered address data based on specified criteria

## Troubleshooting

### Common Issues

1. **Selenium WebDriver Errors**:
   - Ensure the ChromeDriver version matches your Chrome browser version
   - Verify that the WebDriver executable is correctly installed and accessible

2. **Data Processing Errors**:
   - Check the log file at `log.txt` for detailed error information
   - Ensure all required data files are present in the project directory

3. **Mapping Display Issues**:
   - Clear your browser cache and reload the page
   - Verify that the address coordinates have been correctly generated

## Contributing

Contributions to LB Screener are welcome. Please follow these steps to contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure your code follows the existing style patterns and includes appropriate documentation.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- NETRonline for providing access to public records
- OpenStreetMap for mapping data
- The Selenium project for web automation capabilities
- Contributors who have participated in this project
