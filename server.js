const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

// Serve static files (HTML, CSS, JS)
app.use(express.static('public'));

// Endpoint to get list of counties
app.get('/list-counties', (req, res) => {
    const dataPath = path.join(__dirname, 'public/files/Data_By_Towns_Index/');
    fs.readdir(dataPath, (err, counties) => {
        if (err) {
            return res.status(500).send('Unable to scan directory: ' + err);
        }
        // Filter out only directories (counties)
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
        // Filter out only .xlsx files (towns)
        towns = towns.filter(item => item.endsWith('.xlsx'));
        res.json(towns);
    });
});

// Serve index.html as the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
