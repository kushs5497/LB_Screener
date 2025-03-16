require('dotenv').config();
const http = require('http');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Configuration for Google Sheets API
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const CLIENT_EMAIL = process.env.CLIENT_EMAIL;
const PRIVATE_KEY = process.env.PRIVATE_KEY?.replace(/\\n/g, '\n');

// Cache for counties and towns data
const cache = {
  counties: [],
  towns: {}
};

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // Enable CORS for all routes
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // List all counties
  if (req.url === '/list-counties' && req.method === 'GET') {
    try {
      if (cache.counties.length === 0) {
        await loadCountiesFromGoogleSheet();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cache.counties));
    } catch (error) {
      console.error('Error retrieving counties:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to retrieve counties from Google Sheets' }));
    }
  }
  
  // List towns for a specific county
  else if (req.url.startsWith('/list-towns/') && req.method === 'GET') {
    const county = decodeURIComponent(req.url.split('/list-towns/')[1]);
    try {
      if (!cache.towns[county]) {
        await loadTownsForCountyFromGoogleSheet(county);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cache.towns[county] || []));
    } catch (error) {
      console.error(`Error retrieving towns for county ${county}:`, error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Failed to retrieve towns for ${county} from Google Sheets` }));
    }
  }
  
  // Get town data
  else if (req.url.startsWith('/files/Data_By_Towns_Index/') && req.method === 'GET') {
    const pathParts = req.url.split('/files/Data_By_Towns_Index/')[1].split('/');
    const county = decodeURIComponent(pathParts[0]);
    const town = decodeURIComponent(pathParts[1]);
    
    try {
      const townData = await getTownDataFromGoogleSheet(county, town);
      
      // Convert to Excel buffer to maintain compatibility with frontend
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(townData);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
      const excelBuffer = XLSX.write(workbook, { type: 'buffer' });
      
      res.writeHead(200, { 
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${town}.xlsx"`
      });
      res.end(excelBuffer);
    } catch (error) {
      console.error(`Error retrieving data for ${town} in ${county}:`, error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Failed to retrieve data for ${town}` }));
    }
  }
  
  // Save notes
  else if (req.url.startsWith('/save-notes/') && req.method === 'POST') {
    const pathParts = req.url.split('/save-notes/')[1].split('/');
    const county = decodeURIComponent(pathParts[0]);
    const town = decodeURIComponent(pathParts[1]);
    
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        await saveNotesToGoogleSheet(county, town, data.notes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Notes saved successfully' }));
      } catch (error) {
        console.error(`Error saving notes for ${town} in ${county}:`, error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to save notes' }));
      }
    });
  }
  
  // Generic Google Sheets API endpoint
  else if (req.url === '/api/sheets' && req.method === 'GET') {
    try {
      const data = await getGoogleSheetData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (error) {
      console.error('Error retrieving sheet data:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to retrieve data from Google Sheets' }));
    }
  }
  
  // Write to Google Sheets
  else if (req.url === '/api/sheets' && req.method === 'POST') {
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
  }
  
  // Serve static files
  else {
    serveStaticFile(req, res);
  }
});

// Serve static files from the public directory
function serveStaticFile(req, res) {
  const filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const extname = path.extname(filePath);
  const contentType = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif'
  };
  
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

// Load counties from Google Sheets
async function loadCountiesFromGoogleSheet() {
  try {
    // Initialize a new sheet using the service account
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: CLIENT_EMAIL,
      private_key: PRIVATE_KEY,
    });
    
    await doc.loadInfo();
    
    // Assume there's a sheet named "County List" with counties in column A
    const countySheet = doc.sheetsByTitle["County List"] || doc.sheetsByIndex[0];
    const rows = await countySheet.getRows();
    
    // Extract the county names from the first column
    cache.counties = rows.map(row => row._rawData[0]).filter(Boolean);
    
    console.log(`Loaded ${cache.counties.length} counties from Google Sheets`);
    return cache.counties;
  } catch (error) {
    console.error('Error loading counties from Google Sheets:', error);
    
    // Fallback using googleapis
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
        range: 'County List!A:A', // Assuming counties are in column A
      });
      
      // Skip the header row if present
      const values = response.data.values || [];
      cache.counties = values.slice(1).map(row => row[0]).filter(Boolean);
      
      console.log(`Loaded ${cache.counties.length} counties from Google Sheets (fallback)`);
      return cache.counties;
    } catch (fallbackError) {
      console.error('Failed to load counties (fallback):', fallbackError);
      throw new Error('Failed to load counties from Google Sheets');
    }
  }
}

// Load towns for a specific county from Google Sheets
async function loadTownsForCountyFromGoogleSheet(county) {
  try {
    // Initialize a new sheet using the service account
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: CLIENT_EMAIL,
      private_key: PRIVATE_KEY,
    });
    
    await doc.loadInfo();
    
    // Assume there's a sheet named after the county or "County: {countyName}"
    let countySheet;
    const exactMatch = doc.sheetsByTitle[county];
    const prefixMatch = doc.sheetsByTitle[`County: ${county}`];
    
    if (exactMatch) {
      countySheet = exactMatch;
    } else if (prefixMatch) {
      countySheet = prefixMatch;
    } else {
      // Search for a sheet containing the county name
      for (const [title, sheet] of Object.entries(doc.sheetsByTitle)) {
        if (title.includes(county)) {
          countySheet = sheet;
          break;
        }
      }
    }
    
    if (!countySheet) {
      console.warn(`No sheet found for county: ${county}`);
      cache.towns[county] = [];
      return [];
    }
    
    // Get towns from the first column
    const rows = await countySheet.getRows();
    cache.towns[county] = rows.map(row => row._rawData[0]).filter(Boolean);
    
    // Add .xlsx extension to maintain compatibility with frontend
    cache.towns[county] = cache.towns[county].map(town => `${town}.xlsx`);
    
    console.log(`Loaded ${cache.towns[county].length} towns for ${county}`);
    return cache.towns[county];
  } catch (error) {
    console.error(`Error loading towns for ${county}:`, error);
    
    // Fallback using googleapis
    try {
      const auth = new google.auth.JWT(
        CLIENT_EMAIL,
        null,
        PRIVATE_KEY,
        ['https://www.googleapis.com/auth/spreadsheets']
      );
      
      const sheets = google.sheets({ version: 'v4', auth });
      
      // First, get all sheet names to find the county sheet
      const response = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID
      });
      
      const allSheets = response.data.sheets.map(sheet => sheet.properties.title);
      let countySheetName = null;
      
      // Look for exact match, then prefix match, then contains
      if (allSheets.includes(county)) {
        countySheetName = county;
      } else if (allSheets.includes(`County: ${county}`)) {
        countySheetName = `County: ${county}`;
      } else {
        countySheetName = allSheets.find(name => name.includes(county));
      }
      
      if (!countySheetName) {
        console.warn(`No sheet found for county: ${county} (fallback)`);
        cache.towns[county] = [];
        return [];
      }
      
      // Now get the towns from the county sheet
      const townsResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${countySheetName}!A:A` // Assuming towns are in column A
      });
      
      // Skip the header row if present
      const values = townsResponse.data.values || [];
      cache.towns[county] = values.slice(1).map(row => row[0]).filter(Boolean);
      
      // Add .xlsx extension
      cache.towns[county] = cache.towns[county].map(town => `${town}.xlsx`);
      
      console.log(`Loaded ${cache.towns[county].length} towns for ${county} (fallback)`);
      return cache.towns[county];
    } catch (fallbackError) {
      console.error(`Failed to load towns for ${county} (fallback):`, fallbackError);
      throw new Error(`Failed to load towns for ${county}`);
    }
  }
}

// Get town data from Google Sheets
async function getTownDataFromGoogleSheet(county, town) {
  // Remove .xlsx extension if present
  const townName = town.replace('.xlsx', '');
  
  try {
    // Initialize a new sheet using the service account
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: CLIENT_EMAIL,
      private_key: PRIVATE_KEY,
    });
    
    await doc.loadInfo();
    
    // Look for a sheet with the town name or a combination of county and town
    const possibleSheetNames = [
      townName,
      `${county}_${townName}`,
      `${county}/${townName}`,
      `${county} - ${townName}`
    ];
    
    let townSheet = null;
    for (const name of possibleSheetNames) {
      if (doc.sheetsByTitle[name]) {
        townSheet = doc.sheetsByTitle[name];
        break;
      }
    }
    
    if (!townSheet) {
      // If no exact match, look for sheets containing the town name
      for (const [title, sheet] of Object.entries(doc.sheetsByTitle)) {
        if (title.includes(townName)) {
          townSheet = sheet;
          break;
        }
      }
    }
    
    if (!townSheet) {
      throw new Error(`No sheet found for town: ${townName} in county: ${county}`);
    }
    
    const rows = await townSheet.getRows();
    
    // Create a header row with the expected column names
    const headerRow = [
      'Name', 'Address', 'City', 'State', 'Zip', 'Longitude', 'Latitude', 'ID', 'Notes'
    ];
    
    // Map the row data to match the expected format
    const data = [headerRow];
    rows.forEach(row => {
      const rowData = row._rawData;
      data.push([
        rowData[0] || '', // Name
        rowData[1] || '', // Address
        rowData[2] || '', // City
        rowData[3] || '', // State
        rowData[4] || '', // Zip
        rowData[5] || '', // Longitude
        rowData[6] || '', // Latitude
        rowData[7] || '', // ID
        rowData[8] || ''  // Notes
      ]);
    });
    
    return data;
  } catch (error) {
    console.error(`Error getting data for town: ${townName} in county: ${county}:`, error);
    
    // Fallback using googleapis
    try {
      const auth = new google.auth.JWT(
        CLIENT_EMAIL,
        null,
        PRIVATE_KEY,
        ['https://www.googleapis.com/auth/spreadsheets']
      );
      
      const sheets = google.sheets({ version: 'v4', auth });
      
      // First, get all sheet names to find the town sheet
      const response = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID
      });
      
      const allSheets = response.data.sheets.map(sheet => sheet.properties.title);
      const possibleSheetNames = [
        townName,
        `${county}_${townName}`,
        `${county}/${townName}`,
        `${county} - ${townName}`
      ];
      
      let townSheetName = null;
      
      // Check for exact matches first
      for (const name of possibleSheetNames) {
        if (allSheets.includes(name)) {
          townSheetName = name;
          break;
        }
      }
      
      // If no exact match, look for partial matches
      if (!townSheetName) {
        townSheetName = allSheets.find(name => name.includes(townName));
      }
      
      if (!townSheetName) {
        throw new Error(`No sheet found for town: ${townName} in county: ${county} (fallback)`);
      }
      
      // Now get the data from the town sheet
      const dataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${townSheetName}!A:I` // Columns A-I for all data including notes
      });
      
      const values = dataResponse.data.values || [];
      
      // If the sheet doesn't have a header row, add one
      if (values.length === 0 || values[0].length < 9) {
        const headerRow = [
          'Name', 'Address', 'City', 'State', 'Zip', 'Longitude', 'Latitude', 'ID', 'Notes'
        ];
        return [headerRow, ...values];
      }
      
      return values;
    } catch (fallbackError) {
      console.error(`Failed to get data for town: ${townName} in county: ${county} (fallback):`, fallbackError);
      throw new Error(`Failed to get data for town: ${townName}`);
    }
  }
}

// Save notes to Google Sheets
async function saveNotesToGoogleSheet(county, town, notes) {
  // Remove .xlsx extension if present
  const townName = town.replace('.xlsx', '');
  
  try {
    // Initialize a new sheet using the service account
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: CLIENT_EMAIL,
      private_key: PRIVATE_KEY,
    });
    
    await doc.loadInfo();
    
    // Find the appropriate sheet
    const possibleSheetNames = [
      townName,
      `${county}_${townName}`,
      `${county}/${townName}`,
      `${county} - ${townName}`
    ];
    
    let townSheet = null;
    for (const name of possibleSheetNames) {
      if (doc.sheetsByTitle[name]) {
        townSheet = doc.sheetsByTitle[name];
        break;
      }
    }
    
    if (!townSheet) {
      // If no exact match, look for sheets containing the town name
      for (const [title, sheet] of Object.entries(doc.sheetsByTitle)) {
        if (title.includes(townName)) {
          townSheet = sheet;
          break;
        }
      }
    }
    
    if (!townSheet) {
      throw new Error(`No sheet found for town: ${townName} in county: ${county}`);
    }
    
    const rows = await townSheet.getRows();
    
    // Update notes for matching rows
    for (const note of notes) {
      const matchingRow = rows.find(row => 
        row._rawData[0] === note.name && 
        row._rawData[1] === note.address
      );
      
      if (matchingRow) {
        // Check if Notes column exists (should be column I or index 8)
        if (matchingRow._rawData.length <= 8) {
          // Pad the array if needed
          while (matchingRow._rawData.length < 8) {
            matchingRow._rawData.push('');
          }
          // Add the notes column
          matchingRow._rawData.push(note.notes);
        } else {
          // Update existing notes
          matchingRow._rawData[8] = note.notes;
        }
        
        await matchingRow.save();
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Error saving notes for town: ${townName} in county: ${county}:`, error);
    
    // Fallback using googleapis
    try {
      const auth = new google.auth.JWT(
        CLIENT_EMAIL,
        null,
        PRIVATE_KEY,
        ['https://www.googleapis.com/auth/spreadsheets']
      );
      
      const sheets = google.sheets({ version: 'v4', auth });
      
      // First, get all sheet names to find the town sheet
      const response = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID
      });
      
      const allSheets = response.data.sheets.map(sheet => sheet.properties.title);
      const possibleSheetNames = [
        townName,
        `${county}_${townName}`,
        `${county}/${townName}`,
        `${county} - ${townName}`
      ];
      
      let townSheetName = null;
      
      // Check for exact matches first
      for (const name of possibleSheetNames) {
        if (allSheets.includes(name)) {
          townSheetName = name;
          break;
        }
      }
      
      // If no exact match, look for partial matches
      if (!townSheetName) {
        townSheetName = allSheets.find(name => name.includes(townName));
      }
      
      if (!townSheetName) {
        throw new Error(`No sheet found for town: ${townName} in county: ${county} (fallback)`);
      }
      
      // Get the current data from the sheet
      const dataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${townSheetName}!A:I` // Get all data including notes
      });
      
      const values = dataResponse.data.values || [];
      
      // Make sure there's a header row
      if (values.length === 0) {
        throw new Error(`Sheet ${townSheetName} is empty`);
      }
      
      // Ensure the sheet has a Notes column
      if (values[0].length < 9) {
        values[0].push('Notes');
      }
      
      // Update notes for matching rows
      let updated = false;
      for (let i = 1; i < values.length; i++) {
        const row = values[i];
        
        // Ensure the row has 9 columns
        while (row.length < 9) {
          row.push('');
        }
        
        for (const note of notes) {
          if (row[0] === note.name && row[1] === note.address) {
            row[8] = note.notes;
            updated = true;
          }
        }
      }
      
      if (updated) {
        // Update the sheet with the new values
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${townSheetName}!A1:I${values.length}`,
          valueInputOption: 'RAW',
          resource: { values }
        });
      }
      
      return true;
    } catch (fallbackError) {
      console.error(`Failed to save notes for town: ${townName} in county: ${county} (fallback):`, fallbackError);
      throw new Error(`Failed to save notes for town: ${townName}`);
    }
  }
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

// Load counties on server start to warm up the cache
loadCountiesFromGoogleSheet().catch(error => {
  console.error('Failed to preload counties:', error);
});

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
  convertFileToGoogleSheet,
  loadCountiesFromGoogleSheet,
  loadTownsForCountyFromGoogleSheet,
  getTownDataFromGoogleSheet,
  saveNotesToGoogleSheet
};
