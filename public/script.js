window.onload = () => {
  "use strict";

  /**********************************
   *       DOM ELEMENT REFERENCES   *
   **********************************/
  const resizer = document.getElementById('dragMe');
  const leftSide = document.getElementById('side-panel');
  const mapDiv = document.getElementById('map');
  const countyDropdown = $('#countyDropdown');
  const townDropdown = $('#townDropdown');
  const markersTable = document.getElementById('markers-table');
  const markersTableBody = markersTable.querySelector('tbody');

  /**********************************
   *      APPLICATION VARIABLES     *
   **********************************/
  let startX = 0;              // Starting X coordinate for resizing
  let startWidth = 0;          // Initial width of the side panel
  let selectedCounty = null;   // Currently selected county
  let selectedTown = null;     // Currently selected town
  let markers = [];            // Array to store marker data objects

  /**********************************
   *         UTILITY FUNCTIONS      *
   **********************************/
  const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  };

  const updateMapLayout = () => {
    map.invalidateSize();
    updateBounds();
  };

  const debouncedUpdateMapLayout = debounce(updateMapLayout, 100);

  /**********************************
   *       RESIZER EVENT HANDLERS   *
   **********************************/
  const mouseDownHandler = (e) => {
    startX = e.clientX;
    startWidth = parseInt(window.getComputedStyle(leftSide).width, 10);
    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
  };

  const mouseMoveHandler = (e) => {
    const dx = e.clientX - startX;
    const newWidth = startWidth + dx;
    if (newWidth > 250 && newWidth < window.innerWidth - 250) {
      leftSide.style.width = `${newWidth}px`;
      mapDiv.style.left = `${newWidth}px`;
      resizer.style.left = `${newWidth}px`;
      debouncedUpdateMapLayout();
    }
    resizer.style.cursor = 'col-resize';
    document.body.style.cursor = 'col-resize';
    leftSide.style.userSelect = 'none';
    leftSide.style.pointerEvents = 'none';
  };

  const mouseUpHandler = () => {
    resizer.style.removeProperty('cursor');
    document.body.style.removeProperty('cursor');
    leftSide.style.removeProperty('user-select');
    leftSide.style.removeProperty('pointer-events');
    document.removeEventListener('mousemove', mouseMoveHandler);
    document.removeEventListener('mouseup', mouseUpHandler);
  };

  resizer.addEventListener('mousedown', mouseDownHandler);

  /**********************************
   *         LEAFLET MAP SETUP      *
   **********************************/
  const map = L.map('map').setView([40.058323, -74.405663], 8.5);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  /**********************************
   *   COUNTY & TOWN DROPDOWNS      *
   **********************************/
  $.get('/list-counties', (counties) => {
    countyDropdown.empty();
    countyDropdown.append(
      $('<option></option>').attr('value', "Select a County...").text("Select a County...")
    );
    counties.forEach((county) => {
      countyDropdown.append($('<option></option>').attr('value', county).text(county));
    });
  });

  countyDropdown.change(function () {
    selectedCounty = $(this).val();
    if (selectedCounty === 'Select a County...') {
      townDropdown.empty();
      townDropdown.append($('<option></option>').attr('value', null).text('Select a Town...'));
      selectedCounty = null;
    } else {
      $.get(`/list-towns/${selectedCounty}`, (towns) => {
        townDropdown.empty();
        townDropdown.append($('<option></option>').attr('value', null).text('Select a Town...'));
        towns.forEach((town) => {
          townDropdown.append(
            $('<option></option>').attr('value', town).text(town.replace('.xlsx', ''))
          );
        });
      });
    }
  });

  /**********************************
   *      MARKER HELPER FUNCTION    *
   **********************************/
  const createNumberedIcon = (number) => {
    const iconUrl = 'map-marker.png';
    return L.divIcon({
      html: `
        <div class="custom-marker">
          <div class="marker-container">
            <img src="${iconUrl}" alt="Marker" class="marker-image">
            <div class="marker-number">${number}</div>
          </div>
        </div>
      `,
      iconSize: [30, 42],
      iconAnchor: [15, 42],
      className: ''
    });
  };

  /**********************************
   *         MARKER FUNCTIONS       *
   **********************************/
  const clearMarkers = () => {
    markers.forEach((markerData) => {
      if (markerData.marker) {
        map.removeLayer(markerData.marker);
      }
    });
    markers = [];
  };

  townDropdown.change(function () {
    selectedTown = $(this).val();
    if (selectedCounty && selectedTown) {
      clearMarkers();

      fetch(`/files/Data_By_Towns_Index/${selectedCounty}/${selectedTown}`)
        .then(response => response.arrayBuffer())
        .then(data => {
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          markers = [];
          for (let i = 1; i < json.length; i++) {
            const row = json[i];
            if (row && row.length >= 7) {
              markers.push({
                latlng: [row[6], row[5]],
                name: row[0] || 'Unknown',
                address: row[1] || 'No address',
                notes: row[8] || '',
                marker: null
              });
            }
          }

          if (markers.length > 0) {
            const bounds = L.latLngBounds(markers.map(marker => marker.latlng));
            map.fitBounds(bounds);
          }

          markers.forEach((markerData, index) => {
            const numberedIcon = createNumberedIcon(index + 1);
            const marker = L.marker(markerData.latlng, { icon: numberedIcon })
              .addTo(map)
              .bindPopup(`
                <div class="marker-popup">
                  <h6>${markerData.name}</h6>
                  <p>${markerData.address}</p>
                  <hr>
                  <small><i>${markerData.notes}</i></small>
                </div>
              `);
            marker.on('click', () => {
              map.panTo(marker.getLatLng());
              updateBounds();
              marker.openPopup();
              
              // Highlight corresponding row in table
              const rows = markersTableBody.querySelectorAll('tr');
              rows.forEach(row => row.classList.remove('table-active'));
              const targetRow = markersTableBody.querySelector(`tr[data-index="${index}"]`);
              if (targetRow) {
                targetRow.classList.add('table-active');
                targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            });
            markerData.marker = marker;
          });
          updateBounds();
        })
        .catch(error => console.error('Error fetching or processing data:', error));
    }
  });

  /**********************************
   *    UPDATE MARKERS TABLE        *
   **********************************/
  const updateBounds = () => {
    const bounds = map.getBounds();
    markersTableBody.innerHTML = '';
    markers.forEach((markerData, index) => {
      if (bounds.contains(markerData.latlng)) {
        const row = document.createElement('tr');
        row.classList.add('marker-row');
        
        // Index cell
        const indexCell = document.createElement('td');
        indexCell.textContent = index + 1;
        row.appendChild(indexCell);

        // Name cell
        const nameCell = document.createElement('td');
        nameCell.textContent = markerData.name;
        row.appendChild(nameCell);

        // Address cell
        const addressCell = document.createElement('td');
        addressCell.textContent = markerData.address;
        row.appendChild(addressCell);

        // Notes cell with textarea
        const notesCell = document.createElement('td');
        const textarea = document.createElement('textarea');
        textarea.value = markerData.notes;
        textarea.classList.add('form-control');
        textarea.rows = 2;
        textarea.addEventListener('input', () => {
          markerData.notes = textarea.value;
        });
        notesCell.appendChild(textarea);
        row.appendChild(notesCell);

        row.dataset.lat = markerData.latlng[0];
        row.dataset.lng = markerData.latlng[1];
        row.dataset.index = index;
        markersTableBody.appendChild(row);
      }
    });
  };

  /**********************************
   *     TABLE INTERACTION EVENTS   *
   **********************************/
  markersTableBody.addEventListener('click', (e) => {
    const row = e.target.closest('tr');
    if (row && e.target.tagName !== 'TEXTAREA') {
      const lat = parseFloat(row.dataset.lat);
      const lng = parseFloat(row.dataset.lng);
      const index = parseInt(row.dataset.index);
      
      // Highlight clicked row
      const rows = markersTableBody.querySelectorAll('tr');
      rows.forEach(r => r.classList.remove('table-active'));
      row.classList.add('table-active');
      
      // Center map and open popup
      map.setView([lat, lng], 17);
      const markerData = markers[index];
      if (markerData && markerData.marker) {
        markerData.marker.openPopup();
      }
    }
  });

  /**********************************
   *          SAVE NOTES            *
   **********************************/
  const saveNotes = () => {
    if (!selectedCounty || !selectedTown) {
      alert('Please select a county and town first.');
      return;
    }
    
    // Create an array of objects for each row with name, address, and notes
    const notes = [];
    document.querySelectorAll('#markers-table tbody tr').forEach(row => {
      const index = row.dataset.index;
      const textarea = row.querySelector('textarea');
      const markerObj = markers[index];
      
      if (textarea && markerObj) {
        notes.push({
          name: markerObj.name,
          address: markerObj.address,
          notes: textarea.value
        });
      }
    });
    
    // Save all markers notes, not just visible ones
    markers.forEach(marker => {
      if (!notes.some(note => note.name === marker.name && note.address === marker.address)) {
        notes.push({
          name: marker.name,
          address: marker.address,
          notes: marker.notes || ''
        });
      }
    });
    
    fetch(`/save-notes/${selectedCounty}/${selectedTown}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    })
      .then(response => {
        if (response.ok) {
          alert('Notes saved successfully.');
        } else {
          alert('Failed to save notes.');
        }
      })
      .catch(error => {
        console.error('Error saving notes:', error);
        alert('Failed to save notes.');
      });
  };

  // Create and add Save Notes button
  const saveButton = document.createElement('button');
  saveButton.classList.add('btn', 'btn-primary');
  saveButton.innerHTML = '<i class="fas fa-save me-1"></i> Save Notes';
  saveButton.style.marginTop = "15px";
  saveButton.addEventListener('click', saveNotes);
  document.getElementById('side-panel').appendChild(saveButton);

  /**********************************
   *         PRINT PDF FUNCTION     *
   **********************************/
  const { jsPDF } = window.jspdf;
  const generatePDF = () => {
    // Capture the current map view using html2canvas with CORS enabled
    html2canvas(mapDiv, { useCORS: true, scale: 2 }).then(canvas => {
      const mapData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Get the webpage layout widths to mimic the proportions
      const leftWidthPx = leftSide.clientWidth;
      const mapWidthPx = mapDiv.clientWidth;
      const totalPx = leftWidthPx + mapWidthPx;
      const leftRatio = leftWidthPx / totalPx;
      const leftPDFWidth = pageWidth * leftRatio - 10; // subtract margin
      const rightPDFWidth = pageWidth - leftPDFWidth - 20; // margin on both sides

      // Determine the map's aspect ratio
      const aspectRatio = canvas.height / canvas.width;
      const mapPDFHeight = rightPDFWidth * aspectRatio;

      // Gather table data from the markers table
      const rows = [];
      document.querySelectorAll('#markers-table tbody tr').forEach(row => {
        const cols = Array.from(row.children).map(cell => 
          cell.tagName === 'TD' && cell.querySelector('textarea') 
            ? cell.querySelector('textarea').value 
            : cell.innerText
        );
        rows.push(cols);
      });
      const headers = ["#", "Name", "Address", "Notes"];

      const numbers = rows.map(r => parseInt(r[0], 10)).filter(n => !isNaN(n));
      const minNumber = numbers.length ? Math.min(...numbers) : 0;
      const maxNumber = numbers.length ? Math.max(...numbers) : 0;

      // Prepare title text
      const townTitle = selectedTown ? selectedTown.replace(/\.xlsx$/, '') : "Town";
      const titleText = `${townTitle}: ${minNumber} - ${maxNumber}`;

      // Add title
      pdf.setFontSize(16);
      pdf.text(titleText, 10, 15);
      
      // Add date and time
      const now = new Date();
      pdf.setFontSize(10);
      pdf.text(`Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, 
        pageWidth - 15, 15, { align: 'right' });

      // Use autoTable to add the addresses table into the left column
      pdf.autoTable({
        head: [headers],
        body: rows,
        startY: 20,
        tableWidth: leftPDFWidth,
        margin: { left: 7 },
        styles: { fontSize: 10 },
        columnStyles: {
          0: {cellWidth: leftPDFWidth*.10},
          1: {cellWidth: leftPDFWidth*.25},
          2: {cellWidth: leftPDFWidth*.25},
          3: {cellWidth: leftPDFWidth*.40}
        },
        didDrawPage: function (data) {
          // On every page, add the map image to the right column
          const xPos = leftPDFWidth + 9; // left column width plus margin
          const yPos = 20; // top margin
          pdf.addImage(mapData, 'PNG', xPos, yPos, rightPDFWidth, mapPDFHeight);
          
          // Add border around the map
          pdf.setDrawColor(200, 200, 200);
          pdf.rect(xPos, yPos, rightPDFWidth, mapPDFHeight);
          
          // Add page number if multiple pages
          if (data.pageCount > 1) {
            pdf.setFontSize(10);
            pdf.text(`Page ${data.pageCount}`, pageWidth / 2, pageHeight - 10, {
              align: 'center'
            });
          }
        }
      });

      pdf.save(`${townTitle}_Markers.pdf`);
    });
  };

  // Create and add Print PDF button
  const printButton = document.createElement('button');
  printButton.classList.add('btn', 'btn-outline-secondary');
  printButton.innerHTML = '<i class="fas fa-file-pdf me-1"></i> Print PDF';
  printButton.style.marginTop = "15px";
  printButton.style.marginLeft = "10px";
  printButton.addEventListener('click', generatePDF);
  document.getElementById('side-panel').appendChild(printButton);

  /**********************************
   *       MAP EVENT HANDLERS       *
   **********************************/
  map.on('load moveend', updateBounds);

  map.on('boxzoomend', (e) => {
    const boxBounds = e.boxZoomBounds;
    const rows = Array.from(markersTableBody.querySelectorAll('tr'));
    const selectedRows = [];
    const otherRows = [];
    
    rows.forEach(row => {
      const lat = parseFloat(row.dataset.lat);
      const lng = parseFloat(row.dataset.lng);
      
      if (boxBounds.contains([lat, lng])) {
        row.classList.add('table-primary');
        selectedRows.push(row);
      } else {
        row.classList.remove('table-primary');
        otherRows.push(row);
      }
    });
    
    markersTableBody.innerHTML = '';
    selectedRows.forEach(row => markersTableBody.appendChild(row));
    otherRows.forEach(row => markersTableBody.appendChild(row));
  });

  /**********************************
   *       INITIALIZATION           *
   **********************************/
  map.whenReady(updateBounds);
  
  // Add custom CSS for markers and UI
  const style = document.createElement('style');
  style.textContent = `
    .custom-marker {
      position: relative;
    }
    
    .marker-container {
      position: relative;
      width: 30px;
      height: 42px;
    }
    
    .marker-image {
      width: 100%;
      height: 100%;
    }
    
    .marker-number {
      position: absolute;
      top: 3px;
      left: 0;
      width: 100%;
      text-align: center;
      color: white;
      font-weight: bold;
      font-size: 12px;
    }
    
    .marker-popup h6 {
      margin: 0 0 8px 0;
      font-weight: bold;
    }
    
    .marker-popup p {
      margin: 0 0 8px 0;
    }
    
    .marker-row:hover {
      background-color: #f8f9fa;
      cursor: pointer;
    }
    
    .table-active {
      background-color: #e9ecef !important;
    }
    
    .table-primary {
      background-color: #cfe2ff !important;
    }
  `;
  document.head.appendChild(style);
};
