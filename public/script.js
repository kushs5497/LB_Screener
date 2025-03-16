window.onload = () => {
  "use strict";

  /**********************************
   *       DOM ELEMENT REFERENCES   *
   **********************************/
  const resizeHandle = document.getElementById('dragMe');
  const sidePanel = document.getElementById('side-panel');
  const mapDiv = document.getElementById('map');
  const countyDropdown = document.getElementById('countyDropdown');
  const townDropdown = document.getElementById('townDropdown');
  const markersTable = document.getElementById('markers-table');
  const markersTableBody = markersTable.querySelector('tbody');
  const saveButton = document.getElementById('saveButton');
  const printButton = document.getElementById('printButton');

  /**********************************
   *      APPLICATION VARIABLES     *
   **********************************/
  let startX = 0;              // Starting X coordinate for resizing
  let startWidth = 0;          // Initial width of the side panel
  let selectedCounty = null;   // Currently selected county
  let selectedTown = null;     // Currently selected town
  let markers = [];            // Array to store marker data objects
  let markerLayer = L.layerGroup(); // Layer group for markers

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

  const showLoading = (element) => {
    element.classList.add('disabled');
    element.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Loading...';
  };

  const hideLoading = (element, originalText) => {
    element.classList.remove('disabled');
    element.innerHTML = originalText;
  };

  /**********************************
   *       RESIZER EVENT HANDLERS   *
   **********************************/
  const mouseDownHandler = (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = sidePanel.offsetWidth;
    resizeHandle.classList.add('active');
    
    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
  };

  const mouseMoveHandler = (e) => {
    const dx = e.clientX - startX;
    const newWidth = startWidth + dx;
    
    // Set minimum and maximum width constraints
    if (newWidth >= 250 && newWidth <= window.innerWidth - 250) {
      sidePanel.style.flex = `0 0 ${newWidth}px`;
      debouncedUpdateMapLayout();
    }
  };

  const mouseUpHandler = () => {
    resizeHandle.classList.remove('active');
    document.removeEventListener('mousemove', mouseMoveHandler);
    document.removeEventListener('mouseup', mouseUpHandler);
  };

  // Set up the resize event listeners
  resizeHandle.addEventListener('mousedown', mouseDownHandler);

  // Handle double-click on resize handle to reset to default size
  resizeHandle.addEventListener('dblclick', () => {
    sidePanel.style.flex = '0 0 400px';
    debouncedUpdateMapLayout();
  });

  /**********************************
   *         LEAFLET MAP SETUP      *
   **********************************/
  const map = L.map('map', {
    zoomControl: false,
    attributionControl: false
  }).setView([40.058323, -74.405663], 8.5);

  // Add Zoom control in the bottom right corner
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  
  // Add attribution control in the bottom right
  L.control.attribution({ position: 'bottomright' })
    .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | <a href="https://carto.com/attributions">CARTO</a>')
    .addTo(map);

  // Add base tile layer with a modern look
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    subdomains: 'abcd'
  }).addTo(map);

  // Add the marker layer to the map
  markerLayer.addTo(map);

  /**********************************
   *   COUNTY & TOWN DROPDOWNS      *
   **********************************/
  // Fetch counties and populate dropdown
  const loadCounties = () => {
    fetch('/list-counties')
      .then(response => response.json())
      .then(counties => {
        countyDropdown.innerHTML = '<option value="">Select a County...</option>';
        counties.forEach(county => {
          const option = document.createElement('option');
          option.value = county;
          option.textContent = county;
          countyDropdown.appendChild(option);
        });
      })
      .catch(error => {
        console.error('Error fetching counties:', error);
        alert('Failed to load counties. Please try again.');
      });
  };

  // County dropdown change event
  countyDropdown.addEventListener('change', () => {
    selectedCounty = countyDropdown.value;
    townDropdown.innerHTML = '<option value="">Select a Town...</option>';
    
    if (selectedCounty && selectedCounty !== '') {
      showLoading(townDropdown);
      
      fetch(`/list-towns/${selectedCounty}`)
        .then(response => response.json())
        .then(towns => {
          townDropdown.innerHTML = '<option value="">Select a Town...</option>';
          towns.forEach(town => {
            const option = document.createElement('option');
            option.value = town;
            option.textContent = town.replace('.xlsx', '');
            townDropdown.appendChild(option);
          });
          hideLoading(townDropdown, '');
        })
        .catch(error => {
          console.error('Error fetching towns:', error);
          hideLoading(townDropdown, '');
          alert('Failed to load towns. Please try again.');
        });
    } else {
      selectedCounty = null;
      clearMarkers();
    }
  });

  /**********************************
   *      MARKER HELPER FUNCTION    *
   **********************************/
  const createNumberedIcon = (number) => {
    return L.divIcon({
      html: `
        <div class="custom-marker">
          <div class="marker-container">
            <img src="map-marker.png" alt="Marker" class="marker-image">
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
    markerLayer.clearLayers();
    markers = [];
    markersTableBody.innerHTML = '';
  };

  // Town dropdown change event
  townDropdown.addEventListener('change', () => {
    selectedTown = townDropdown.value;
    
    if (selectedCounty && selectedTown) {
      clearMarkers();
      showLoading(townDropdown);
      
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
            if (row[6] && row[5]) { // Ensure lat/lng exist
              markers.push({
                latlng: [row[6], row[5]],
                name: row[0] || 'Unknown',
                address: row[1] || 'No address',
                notes: row[8] || '',
                marker: null
              });
            }
          }
          
          createMarkers();
          hideLoading(townDropdown, '');
        })
        .catch(error => {
          console.error('Error fetching or processing data:', error);
          hideLoading(townDropdown, '');
          alert('Failed to load data. Please try again.');
        });
    } else {
      clearMarkers();
    }
  });

  // Create markers on the map from loaded data
  const createMarkers = () => {
    if (markers.length === 0) {
      alert('No valid marker data found for this town.');
      return;
    }
    
    // Clear existing markers
    markerLayer.clearLayers();
    
    // Create new markers
    markers.forEach((markerData, index) => {
      const numberedIcon = createNumberedIcon(index + 1);
      const marker = L.marker(markerData.latlng, { icon: numberedIcon })
        .bindPopup(`
          <div class="marker-popup">
            <h6>${markerData.name}</h6>
            <p>${markerData.address}</p>
            <hr>
            <small><i>${markerData.notes}</i></small>
          </div>
        `);
      
      marker.on('click', () => {
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
      markerLayer.addLayer(marker);
    });
    
    // Fit map to marker bounds with padding
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(marker => marker.latlng));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
    
    updateBounds();
  };

  /**********************************
   *    UPDATE MARKERS TABLE        *
   **********************************/
  const updateBounds = () => {
    const bounds = map.getBounds();
    markersTableBody.innerHTML = '';
    
    markers.forEach((markerData, index) => {
      if (bounds.contains(markerData.latlng)) {
        const row = document.createElement('tr');
        row.dataset.index = index;
        row.dataset.lat = markerData.latlng[0];
        row.dataset.lng = markerData.latlng[1];
        
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
        textarea.rows = 2;
        textarea.classList.add('form-control');
        textarea.addEventListener('input', () => {
          markerData.notes = textarea.value;
        });
        notesCell.appendChild(textarea);
        row.appendChild(notesCell);
        
        markersTableBody.appendChild(row);
      }
    });
  };

  /**********************************
   *     TABLE INTERACTION EVENTS   *
   **********************************/
  markersTableBody.addEventListener('click', (e) => {
    if (e.target.tagName !== 'TEXTAREA') {
      const row = e.target.closest('tr');
      if (row) {
        const index = parseInt(row.dataset.index, 10);
        const lat = parseFloat(row.dataset.lat);
        const lng = parseFloat(row.dataset.lng);
        
        // Highlight clicked row
        const rows = markersTableBody.querySelectorAll('tr');
        rows.forEach(r => r.classList.remove('table-active'));
        row.classList.add('table-active');
        
        // Center map on marker
        map.setView([lat, lng], 17);
        
        // Open popup
        if (markers[index] && markers[index].marker) {
          markers[index].marker.openPopup();
        }
      }
    }
  });

  /**********************************
   *          SAVE NOTES            *
   **********************************/
  saveButton.addEventListener('click', () => {
    if (!selectedCounty || !selectedTown) {
      alert('Please select a county and town first.');
      return;
    }
    
    showLoading(saveButton);
    
    // Create an array of objects with name, address, and notes
    const notes = markers.map(marker => ({
      name: marker.name,
      address: marker.address,
      notes: marker.notes
    }));
    
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
        hideLoading(saveButton, '<i class="fas fa-save me-1"></i> Save Notes');
      })
      .catch(error => {
        console.error('Error saving notes:', error);
        alert('Failed to save notes.');
        hideLoading(saveButton, '<i class="fas fa-save me-1"></i> Save Notes');
      });
  });

  /**********************************
   *         PRINT PDF FUNCTION     *
   **********************************/
  printButton.addEventListener('click', () => {
    if (markers.length === 0) {
      alert('No data to export. Please select a town first.');
      return;
    }
    
    showLoading(printButton);
    
    const { jsPDF } = window.jspdf;
    
    // Capture the current map view
    html2canvas(mapDiv, { 
      useCORS: true,
      scale: 2,
      logging: false
    }).then(canvas => {
      const mapData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      // Calculate layout dimensions
      const leftPDFWidth = pageWidth * 0.55; // 55% for table
      const rightPDFWidth = pageWidth * 0.4; // 40% for map
      
      // Calculate map dimensions preserving aspect ratio
      const aspectRatio = canvas.height / canvas.width;
      const mapPDFHeight = rightPDFWidth * aspectRatio;
      
      // Prepare table data
      const visibleMarkers = markers.filter(marker => 
        map.getBounds().contains(marker.latlng)
      );
      
      const tableData = visibleMarkers.map((marker, idx) => [
        idx + 1,
        marker.name,
        marker.address,
        marker.notes
      ]);
      
      // Prepare title text
      const townTitle = selectedTown ? selectedTown.replace(/\.xlsx$/, '') : "Town";
      const countRange = tableData.length > 0 
        ? `${1} - ${tableData.length}`
        : "No visible markers";
      const titleText = `${townTitle}: ${countRange}`;
      
      // Add title
      pdf.setFontSize(16);
      pdf.text(titleText, 10, 15);
      
      // Add date and time
      const now = new Date();
      pdf.setFontSize(10);
      pdf.text(`Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, 
        pageWidth - 15, 15, { align: 'right' });
      
      // Add table
      pdf.autoTable({
        head: [['#', 'Name', 'Address', 'Notes']],
        body: tableData,
        startY: 20,
        margin: { left: 10 },
        tableWidth: leftPDFWidth,
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: leftPDFWidth * 0.08 }, // #
          1: { cellWidth: leftPDFWidth * 0.25 }, // Name
          2: { cellWidth: leftPDFWidth * 0.27 }, // Address
          3: { cellWidth: leftPDFWidth * 0.40 }  // Notes
        },
        didDrawPage: function(data) {
          // Add map image
          const xPos = leftPDFWidth + 15; // Position after table + margin
          const yPos = 20; // Top margin
          
          pdf.addImage(
            mapData, 'PNG', 
            xPos, yPos, 
            rightPDFWidth, mapPDFHeight
          );
          
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
      hideLoading(printButton, '<i class="fas fa-file-pdf me-1"></i> Print PDF');
    })
    .catch(error => {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
      hideLoading(printButton, '<i class="fas fa-file-pdf me-1"></i> Print PDF');
    });
  });

  /**********************************
   *       MAP EVENT HANDLERS       *
   **********************************/
  map.on('moveend zoomend', updateBounds);
  
  map.on('boxzoomend', (e) => {
    const boxBounds = e.boxZoomBounds;
    const rows = Array.from(markersTableBody.querySelectorAll('tr'));
    
    // Filter and sort rows based on whether they're in the box
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
    
    // Reappend rows to display selected ones first
    markersTableBody.innerHTML = '';
    selectedRows.forEach(row => markersTableBody.appendChild(row));
    otherRows.forEach(row => markersTableBody.appendChild(row));
  });

  /**********************************
   *       WINDOW EVENTS            *
   **********************************/
  window.addEventListener('resize', debounce(() => {
    // Reset side panel if window gets too small
    if (window.innerWidth < 768) {
      sidePanel.style.flex = 'auto';
    }
    updateMapLayout();
  }, 200));

  /**********************************
   *       INITIALIZATION           *
   **********************************/
  loadCounties();
  map.whenReady(updateMapLayout);
  
  // Add custom CSS for markers
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
  `;
  document.head.appendChild(style);
};
