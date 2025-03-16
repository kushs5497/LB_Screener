# Google Sheets Integration Setup Guide

This guide will walk you through setting up the necessary API keys and configurations to connect your application with Google Sheets.

## Prerequisites

- Google account
- Node.js and npm installed
- Basic understanding of terminal/command line

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click on "Select a project" at the top of the page, then click "New Project"
3. Name your project (e.g., "My Data Transfer Project") and click "Create"
4. Select your newly created project from the project selector

## Step 2: Enable the Google Sheets API

1. In your Google Cloud Console, navigate to "APIs & Services" > "Library"
2. Search for "Google Sheets API"
3. Click on "Google Sheets API" in the results
4. Click "Enable"

## Step 3: Create a Service Account

1. In your Google Cloud Console, navigate to "APIs & Services" > "Credentials"
2. Click on "Create Credentials" and select "Service Account"
3. Enter a name for your service account (e.g., "sheets-integration")
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

## Step 5: Share Your Google Sheet

1. Create a new Google Sheet or use an existing one
2. Click the "Share" button in the top-right corner
3. In the "People" field, enter the email address of your service account (found in the JSON file as `client_email`)
4. Make sure the permission is set to "Editor" if you want to write data to the sheet
5. Click "Share" or "Send"

## Step 6: Set Up Environment Variables

Create a `.env` file in your project root with the following variables:

```
SPREADSHEET_ID=your_spreadsheet_id
CLIENT_EMAIL=your_service_account_email
PRIVATE_KEY=your_private_key
```

Where:

- `SPREADSHEET_ID` is the ID of your Google Sheet. You can find this in the URL of your sheet: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`
- `CLIENT_EMAIL` is the email address of your service account (from the JSON file)
- `PRIVATE_KEY` is the private key from your JSON file. Make sure to include the entire key including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` parts. You may need to escape newlines by replacing them with `\n`.

## Step 7: Install Required Packages

Run the following command to install the necessary packages:

```bash
npm install googleapis google-spreadsheet dotenv
```

## Verification

To verify your setup:

1. Run the `script_new.js` file using:
   ```bash
   node script_new.js
   ```
2. If everything is set up correctly, you should see data from your Google Sheet printed in the console.

## Troubleshooting

- **Authentication Errors**: Double-check your `CLIENT_EMAIL` and `PRIVATE_KEY` environment variables.
- **Access Denied**: Ensure your service account has the correct permissions on the Google Sheet.
- **API Not Enabled**: Verify that the Google Sheets API is enabled for your project.
- **Invalid Spreadsheet ID**: Confirm that your `SPREADSHEET_ID` is correct by checking the URL of your Google Sheet.

## Security Notes

- Never commit your `.env` file or service account JSON file to version control.
- Consider using a secrets management system for production environments.
- Restrict service account permissions to only what's necessary for your application.
