# Google Sheets Integration for Town Data Application

This guide walks you through setting up Google Sheets integration for the Town Data application using `server_new.js`.

## Prerequisites

- Google account
- Node.js (v12+) and npm installed
- Basic understanding of terminal/command line

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click on "Select a project" at the top of the page, then click "New Project"
3. Name your project (e.g., "Town Data Project") and click "Create"
4. Select your newly created project from the project selector

## Step 2: Enable the Google Sheets API

1. In your Google Cloud Console, navigate to "APIs & Services" > "Library"
2. Search for "Google Sheets API"
3. Click on "Google Sheets API" in the results
4. Click "Enable"

## Step 3: Create a Service Account

1. In your Google Cloud Console, navigate to "APIs & Services" > "Credentials"
2. Click on "Create Credentials" and select "Service Account"
3. Enter a name for your service account (e.g., "town-data-service")
4. Optionally add a description, then click "Create and Continue"
5. For the role, select "Project" > "Editor" to give full access to the project
6. Click "Continue" and then "Done"

## Step 4: Generate and Download Service Account Key

1. In the Credentials page, find your newly created service account and click on it
2. Go to the "Keys" tab
3. Click "Add Key" > "Create new key"
4. Select "JSON" as the key type and click "Create"
5. A JSON file containing your private key will be downloaded to your computer
6. Keep this file secure as it contains sensitive information

## Step 5: Set Up Your Google Spreadsheet

1. Create a new Google Spreadsheet
2. Rename the first sheet to "County List"
3. In the County List sheet:
   - Column A should contain the list of county names (e.g., "Atlantic", "Bergen", etc.)
   - Start with the county name in cell A1, with no header row

4. For each county, create a separate sheet with the county name (e.g., "Atlantic")
   - In this sheet, column A should contain the list of town names for that county
   - Do not include ".xlsx" in the town names, as the application will add this automatically

5. For each town, create a separate sheet named after the town (e.g., "Atlantic City")
   - Structure each town sheet with the following columns:
     - A: Name
     - B: Address
     - C: City
     - D: State
     - E: Zip
     - F: Longitude
     - G: Latitude
     - H: ID
     - I: Notes

6. Click the "Share" button in the top-right corner
7. In the "People" field, enter the email address of your service account (found in the JSON file as `client_email`)
8. Make sure the permission is set to "Editor"
9. Click "Share" or "Send"

## Step 6: Set Up Environment Variables

1. Create a `.env` file in your project root with the following variables:

```
SPREADSHEET_ID=your_spreadsheet_id
CLIENT_EMAIL=your_service_account_email
PRIVATE_KEY=your_private_key
PORT=3000
```

2. Replace the placeholder values:
   - `SPREADSHEET_ID`: The ID of your Google Sheet, found in the URL: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`
   - `CLIENT_EMAIL`: The email address of your service account (from the JSON file)
   - `PRIVATE_KEY`: The private key from your JSON file, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` parts.
     - Note: You must replace all newlines with `\n` in the private key

Example of properly formatted private key:
```
PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEF...\n-----END PRIVATE KEY-----\n"
```

## Step 7: Install Required Packages

Run the following command to install the necessary packages:

```bash
npm install express googleapis google-spreadsheet dotenv xlsx
```

## Step 8: Run the Server

1. Start the server using:
   ```bash
   node server_new.js
   ```
2. You should see output indicating the server is running at http://localhost:3000
3. Open your browser and navigate to http://localhost:3000 to access the application

## Troubleshooting

### Connection Issues

- **Authentication Errors**: Double-check your `CLIENT_EMAIL` and `PRIVATE_KEY` environment variables.
  - Ensure the private key is properly formatted with escaped newlines (`\n`)
  - Make sure there are no extra spaces or quotes around the values

- **Access Denied**: 
  - Verify that your service account has "Editor" access to the Google Sheet
  - Check if the email address is correct and has been properly shared

- **API Not Enabled**: 
  - Ensure that the Google Sheets API is enabled for your project
  - Go to APIs & Services > Dashboard to verify

### Data Structure Issues

- **No Counties Listed**: 
  - Ensure you have a sheet named "County List" with county names in column A
  - Check that the service account has access to the spreadsheet

- **No Towns Listed for a County**: 
  - Verify that there's a sheet named exactly after the county
  - Check that town names are listed in column A of the county sheet

- **Town Data Not Loading**: 
  - Ensure there's a sheet named after the town
  - Check that the data is structured with the correct columns (Name, Address, etc.)

### Server Issues

- **Server Not Starting**: 
  - Check for any error messages in the console
  - Verify that the required packages are installed
  - Ensure no other process is using port 3000

## Security Notes

- Never commit your `.env` file or service account JSON file to version control
- Consider using a secrets management system for production environments
- Restrict service account permissions to only what's necessary for your application
- Regularly rotate service account keys for enhanced security
