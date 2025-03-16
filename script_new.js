require('dotenv').config();
const http = require('http');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Configuration for Google Sheets API
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const CLIENT_EMAIL = process.env.CLIENT_EMAIL;
const PRIVATE_KEY = process.env.PRIVATE_KEY?.replace(/\\n/g, '\n');

// Create HTTP server
const server = http.createServer(async (req, res) => {
  if (req.url === '/api/sheets' && req.method === 'GET') {
    try {
      const data = await getGoogleSheetData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (error) {
      console.error('Error retrieving sheet data:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to retrieve data from Google Sheets' }));
    }
  } else if (req.url === '/api/sheets' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        await writeToGoogleSheet(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Data successfully written to Google Sheets' }));
      } catch (error) {
        console.error('Error writing to sheet:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to write data to Google Sheets' }));
      }
    });
  } else {
    // Serve static files
    serveStaticFile(req, res);
  }
});

// Serve static files from the public directory
function serveStaticFile(req, res) {
  const filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const contentType = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif'
  };

  const extname = path.extname(filePath);
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType[extname] || 'text/plain' });
      res.end(content);
    }
  });
}

// Function to get data from Google Sheets using Service Account
async function getGoogleSheetData() {
  try {
    // Method 1: Using google-spreadsheet package
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    
    await doc.useServiceAccountAuth({
      client_email: CLIENT_EMAIL,
      private_key: PRIVATE_KEY,
    });
    
    await doc.loadInfo();
    
    const sheet = doc.sheetsByIndex[0]; // Get the first sheet
    const rows = await sheet.getRows();
    
    return rows.map(row => row._rawData);
  } catch (error) {
    console.error('Error in getGoogleSheetData method 1:', error);
    
    // Fallback to Method 2: Using googleapis package
    try {
      const auth = new google.auth.JWT(
        CLIENT_EMAIL,
        null,
        PRIVATE_KEY,
        ['https://www.googleapis.com/auth/spreadsheets']
      );
      
      const sheets = google.sheets({ version: 'v4', auth });
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1', // You can specify the range like 'Sheet1!A1:E10'
      });
      
      return response.data.values;
    } catch (fallbackError) {
      console.error('Error in getGoogleSheetData method 2:', fallbackError);
      throw new Error('Failed to retrieve data from Google Sheets using both methods');
    }
  }
}

// Function to write data to Google Sheets
async function writeToGoogleSheet(data) {
  try {
    // Method 1: Using google-spreadsheet package
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    
    await doc.useServiceAccountAuth({
      client_email: CLIENT_EMAIL,
      private_key: PRIVATE_KEY,
    });
    
    await doc.loadInfo();
    
    const sheet = doc.sheetsByIndex[0]; // Get the first sheet
    
    if (Array.isArray(data)) {
      // Add multiple rows
      await sheet.addRows(data);
    } else {
      // Add a single row
      await sheet.addRow(data);
    }
    
    return true;
  } catch (error) {
    console.error('Error in writeToGoogleSheet method 1:', error);
    
    // Fallback to Method 2: Using googleapis package
    try {
      const auth = new google.auth.JWT(
        CLIENT_EMAIL,
        null,
        PRIVATE_KEY,
        ['https://www.googleapis.com/auth/spreadsheets']
      );
      
      const sheets = google.sheets({ version: 'v4', auth });
      
      const values = Array.isArray(data) ? data : [Object.values(data)];
      
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1',
        valueInputOption: 'USER_ENTERED',
        resource: { values },
      });
      
      return true;
    } catch (fallbackError) {
      console.error('Error in writeToGoogleSheet method 2:', fallbackError);
      throw new Error('Failed to write data to Google Sheets using both methods');
    }
  }
}

// Function to convert CSV or XLSX to Google Sheets
async function convertFileToGoogleSheet(filePath) {
  try {
    let data;
    if (filePath.endsWith('.csv')) {
      // Read CSV file
      const csvContent = fs.readFileSync(filePath, 'utf8');
      data = parseCSV(csvContent);
    } else if (filePath.endsWith('.xlsx')) {
      // For XLSX files, you would need a library like xlsx
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    } else {
      throw new Error('Unsupported file format. Only CSV and XLSX are supported.');
    }
    
    // Write the data to Google Sheets
    await writeToGoogleSheet(data);
    return true;
  } catch (error) {
    console.error('Error converting file to Google Sheet:', error);
    throw error;
  }
}

// Helper function to parse CSV
function parseCSV(csvContent) {
  const lines = csvContent.split('\n');
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line) {
      // This is a simple parser - in a real app, use a proper CSV parsing library
      result.push(line.split(',').map(cell => cell.trim()));
    }
  }
  
  return result;
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Google Sheets integration available at http://localhost:${PORT}/api/sheets`);
});

// Export functions for use in other files
module.exports = {
  getGoogleSheetData,
  writeToGoogleSheet,
  convertFileToGoogleSheet
};
