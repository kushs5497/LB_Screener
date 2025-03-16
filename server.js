const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser'); // Add this to parse JSON bodies
const XLSX = require('xlsx'); // Add this to work with Excel files

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(bodyParser.json()); // Add this middleware to parse JSON bodies

// Endpoint to get list of counties
app.get('/list-counties', (req, res) => {
    const dataPath = path.join(__dirname, 'public/files/Data_By_Towns_Index/');
    fs.readdir(dataPath, (err, counties) => {
        if (err) {
            return res.status(500).send('Unable to scan directory: ' + err);
        }
        counties = counties.filter(item => fs.lstatSync(path.join(dataPath, item)).isDirectory());
        res.json(counties);
    });
});

// Endpoint to get list of towns for a specific county
app.get('/list-towns/:county', (req, res) => {
    const { county } = req.params;
    const countyPath = path.join(__dirname, 'public/files/Data_By_Towns_Index/', county);
    fs.readdir(countyPath, (err, towns) => {
        if (err) {
            return res.status(500).send('Unable to scan directory: ' + err);
        }
        towns = towns.filter(item => item.endsWith('.xlsx'));
        res.json(towns);
    });
});

// Endpoint to save notes to the Excel file
app.post('/save-notes/:county/:town', (req, res) => {
    const { county, town } = req.params;
    const notesData = req.body.notes; // Ensure we access the correct key

    console.log('Received notesData:', notesData); // Debugging

    if (!Array.isArray(notesData)) {
        return res.status(400).send('Invalid data format: Expected an array');
    }

    const filePath = path.join(__dirname, 'public/files/Data_By_Towns_Index', county, town);

    try {
        const workbook = XLSX.readFile(filePath);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        for (let i = 1; i < json.length; i++) {
            const row = json[i];
            const notesEntry = notesData.find(entry => 
                entry.name === row[0] && entry.address === row[1] // Ensure correct indices
            );
            if (notesEntry) {
                row[8] = notesEntry.notes; // Now storing in column 9 (index 8)
            }
        }

        const newWorksheet = XLSX.utils.aoa_to_sheet(json); // Fix conversion
        workbook.Sheets[firstSheetName] = newWorksheet;
        XLSX.writeFile(workbook, filePath);

        res.status(200).send('Notes saved successfully');
    } catch (error) {
        console.error('Error saving notes:', error);
        res.status(500).send('Error saving notes');
    }
});


// Serve index.html as the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
