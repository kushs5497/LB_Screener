window.onload = () => {
  "use strict";

  /**********************************
   *       DOM ELEMENT REFERENCES   *
   **********************************/
  const resizer = document.getElementById('dragMe');
  const leftSide = document.getElementById('side-panel'); // contains the table
  const mapDiv = document.getElementById('map');          // contains the Leaflet map
  const countyDropdown = $('#countyDropdown');
  const townDropdown = $('#townDropdown');
  const markersTable = document.getElementById('markers-table');
  const markersTableBody = markersTable.querySelector('tbody');

  // Check if buttons already exist and remove them to prevent duplicates
  const existingSaveButton = document.getElementById('saveNotesButton');
  const existingPrintButton = document.getElementById('printPdfButton');
  if (existingSaveButton) existingSaveButton.remove();
  if (existingPrintButton) existingPrintButton.remove();

  /**********************************
   *      APPLICATION VARIABLES     *
   **********************************/
  let startX = 0;              // Starting X coordinate for resizing
  let startWidth = 0;          // Initial width of the side panel
  let selectedCounty = null;   // Currently selected county
  let selectedTown = null;     // Currently selected town
  let markers = [];            // Array to store marker data objects
  let isResizing = false;      // Flag to track resizing state

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
    e.preventDefault();
    startX = e.clientX;
    startWidth = parseInt(window.getComputedStyle(leftSide).width, 10);
    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
    isResizing = true;
    
    // Add active state styling
    resizer.classList.add('active');
    document.body.style.cursor = 'col-resize';
  };

  const mouseMoveHandler = (e) => {
    if (!isResizing) return;
    
    const dx = e.clientX - startX;
    const newWidth = startWidth + dx;
    
    if (newWidth > 300 && newWidth < window.innerWidth - 300) {
      leftSide.style.width = `${newWidth}px`;
      mapDiv.style.left = `${newWidth}px`;
      resizer.style.left = `${newWidth}px`;
      debouncedUpdateMapLayout();
    }
    
    leftSide.style.userSelect = 'none';
    leftSide.style.pointerEvents = 'none';
  };

  const mouseUpHandler = () => {
    isResizing = false;
    resizer.classList.remove('active');
    document.body.style.removeProperty('cursor');
    leftSide.style.removeProperty('user-select');
    leftSide.style.removeProperty('pointer-events');
    document.removeEventListener('mousemove', mouseMoveHandler);
    document.removeEventListener('mouseup', mouseUpHandler);
    
    // Force map to update after resize is complete
    updateMapLayout();
  };

  resizer.addEventListener('mousedown', mouseDownHandler);

  /**********************************
   *         LEAFLET MAP SETUP      *
   **********************************/
  const map = L.map('map', {
    zoomControl: false,
    attributionControl: false
  }).setView([40.058323, -74.405663], 8.5);
  
  // Add zoom controls to bottom right
  L.control.zoom({
    position: 'bottomright'
  }).addTo(map);
  
  // Add attribution to bottom right
  L.control.attribution({
    position: 'bottomright'
  }).addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | <a href="https://carto.com/attributions">CARTO</a>')
    .addTo(map);
  
  // Add modern tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  /**********************************
   *   UI FEEDBACK FUNCTIONS        *
   **********************************/
  const showLoading = (element, text = 'Loading...') => {
    if (element instanceof jQuery) {
      element.prop('disabled', true)
        .html(`<i class="fas fa-spinner fa-spin me-1"></i> ${text}`);
    } else if (element) {
      element.disabled = true;
      element.innerHTML = `<i class="fas fa-spinner fa-spin me-1"></i> ${text}`;
    }
  };
  
  const hideLoading = (element, originalText, icon = null) => {
    if (element instanceof jQuery) {
      element.prop('disabled', false)
        .html(icon ? `<i class="${icon} me-1"></i> ${originalText}` : originalText);
    } else if (element) {
      element.disabled = false;
      element.innerHTML = icon ? `<i class="${icon} me-1"></i> ${originalText}` : originalText;
    }
  };
  
  const showToast = (message, type = 'success') => {
    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-icon">
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
      </div>
      <div class="toast-content">${message}</div>
    `;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Animate and remove after delay
    setTimeout(() => {
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }, 100);
  };

  /**********************************
   *   COUNTY & TOWN DROPDOWNS      *
   **********************************/
  const loadCounties = () => {
    showLoading(countyDropdown, 'Loading counties...');
    
    $.get('/list-counties', (counties) => {
      countyDropdown.empty();
      countyDropdown.append(
        $('<option></option>').attr('value', "Select a County...").text("Select a County...")
      );
      counties.forEach((county) => {
        countyDropdown.append($('<option></option>').attr('value', county).text(county));
      });
      
      hideLoading(countyDropdown, "Select a County...", "fas fa-map");
    }).fail(() => {
      hideLoading(countyDropdown, "Error loading counties", "fas fa-exclamation-triangle");
      showToast('Failed to load counties. Please try again.', 'error');
    });
  };

  countyDropdown.change(function () {
    selectedCounty = $(this).val();
    if (selectedCounty === 'Select a County...') {
      townDropdown.empty();
      townDropdown.append($('<option></option>').attr('value', null).text('Select a Town...'));
      townDropdown.prop('disabled', true);
      selectedCounty = null;
    } else {
      showLoading(townDropdown, 'Loading towns...');
      townDropdown.prop('disabled', true);
      
      $.get(`/list-towns/${selectedCounty}`, (towns) => {
        townDropdown.empty();
        townDropdown.append($('<option></option>').attr('value', null).text('Select a Town...'));
        towns.forEach((town) => {
          townDropdown.append(
            $('<option></option>').attr('value', town).text(town.replace('.xlsx', ''))
          );
        });
        
        hideLoading(townDropdown, "Select a Town...", "fas fa-city");
        townDropdown.prop('disabled', false);
      }).fail(() => {
        hideLoading(townDropdown, "Error loading towns", "fas fa-exclamation-triangle");
        showToast('Failed to load towns. Please try again.', 'error');
      });
    }
  });

  /**********************************
   *      MARKER HELPER FUNCTION    *
   **********************************/
  const createNumberedMarkerIcon = (number) => {
    const iconUrl = 'map-marker.png';
    return L.divIcon({
      html: `
        <div class="custom-marker">
          <img src="${iconUrl}" class="marker-image">
          <div class="marker-number">${number}</div>
        </div>
      `,
      iconSize: [28, 42],
      iconAnchor: [14, 42],
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
    markersTableBody.innerHTML = '';
  };

  townDropdown.change(function () {
    selectedTown = $(this).val();
    if (!selectedTown) return;
    
    if (selectedCounty && selectedTown) {
      clearMarkers();
      showLoading(this, 'Loading data...');
      
      const townText = $(this).find('option:selected').text();
      
      fetch(`/files/Data_By_Towns_Index/${selectedCounty}/${selectedTown}`)
        .then(response => {
          if (!response.ok) throw new Error('Failed to fetch data');
          return response.arrayBuffer();
        })
        .then(data => {
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          markers = [];
          for (let i = 1; i < json.length; i++) {
            const row = json[i];
            if (row && row.length >= 7 && row[6] && row[5]) {
              markers.push({
                latlng: [parseFloat(row[6]), parseFloat(row[5])],
                name: row[0] || 'Unknown',
                address: row[1] || 'No address',
                notes: row[8] || '',
                marker: null
              });
            }
          }

          if (markers.length > 0) {
            const bounds = L.latLngBounds(markers.map(marker => marker.latlng));
            map.fitBounds(bounds, { padding: [50, 50] });
            
            markers.forEach((markerData, index) => {
              const numberedIcon = createNumberedMarkerIcon(index + 1);
              const marker = L.marker(markerData.latlng, { icon: numberedIcon })
                .addTo(map)
                .bindPopup(`
                  <div class="marker-popup">
                    <h4>${markerData.name}</h4>
                    <p><i class="fas fa-map-marker-alt text-danger"></i> ${markerData.address}</p>
                    ${markerData.notes ? `<hr><div class="notes"><i class="fas fa-sticky-note text-info"></i> ${markerData.notes}</div>` : ''}
                  </div>
                `);
              
              marker.on('click', () => {
                map.panTo(marker.getLatLng());
                updateBounds();
                marker.openPopup();
                
                // Highlight corresponding table row
                const tableRow = document.querySelector(`tr[data-index="${index}"]`);
                if (tableRow) {
                  const allRows = markersTableBody.querySelectorAll('tr');
                  allRows.forEach(row => row.classList.remove('highlight'));
                  tableRow.classList.add('highlight');
                  tableRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              });
              
              markerData.marker = marker;
            });
            
            updateBounds();
            hideLoading(this, townText);
            showToast(`Loaded ${markers.length} locations for ${townText}`);
          } else {
            hideLoading(this, townText);
            showToast('No valid marker data found for this town', 'error');
          }
        })
        .catch(error => {
          console.error('Error fetching or processing data:', error);
          hideLoading(this, townText);
          showToast('Error loading data. Please try again.', 'error');
        });
    }
  });

  /**********************************
   *    UPDATE MARKERS TABLE        *
   **********************************/
  const updateBounds = () => {
    if (!map || !markersTableBody) return;
    
    const bounds = map.getBounds();
    markersTableBody.innerHTML = '';
    
    let visibleMarkers = 0;
    markers.forEach((markerData, index) => {
      if (bounds.contains(markerData.latlng)) {
        visibleMarkers++;
        
        const row = document.createElement('tr');
        row.className = 'marker-row';
        row.dataset.lat = markerData.latlng[0];
        row.dataset.lng = markerData.latlng[1];
        row.dataset.index = index;
        
        // Index cell with marker number
        const numberCell = document.createElement('td');
        numberCell.className = 'text-center';
        numberCell.innerHTML = `<span class="marker-badge">${index + 1}</span>`;
        row.appendChild(numberCell);

        // Name cell
        const nameCell = document.createElement('td');
        nameCell.className = 'name-cell';
        nameCell.innerHTML = `<i class="fas fa-user text-primary me-1"></i> ${markerData.name}`;
        row.appendChild(nameCell);

        // Address cell
        const addressCell = document.createElement('td');
        addressCell.className = 'address-cell';
        addressCell.innerHTML = `<i class="fas fa-map-marker-alt text-danger me-1"></i> ${markerData.address}`;
        row.appendChild(addressCell);

        // Notes cell with textarea
        const notesCell = document.createElement('td');
        notesCell.className = 'notes-cell';
        
        const textarea = document.createElement('textarea');
        textarea.className = 'form-control notes-textarea';
        textarea.placeholder = 'Add notes here...';
        textarea.value = markerData.notes;
        textarea.rows = 2;
        
        textarea.addEventListener('input', () => {
          markerData.notes = textarea.value;
          
          // Update popup content if open
          if (markerData.marker && markerData.marker.getPopup() && markerData.marker.isPopupOpen()) {
            markerData.marker.setPopupContent(`
              <div class="marker-popup">
                <h4>${markerData.name}</h4>
                <p><i class="fas fa-map-marker-alt text-danger"></i> ${markerData.address}</p>
                ${textarea.value ? `<hr><div class="notes"><i class="fas fa-sticky-note text-info"></i> ${textarea.value}</div>` : ''}
              </div>
            `);
          }
        });
        
        notesCell.appendChild(textarea);
        row.appendChild(notesCell);
        
        // Add hover effect
        row.addEventListener('mouseenter', () => {
          if (markerData.marker) {
            markerData.marker.setZIndexOffset(1000);
            row.classList.add('active');
          }
        });
        
        row.addEventListener('mouseleave', () => {
          if (markerData.marker) {
            markerData.marker.setZIndexOffset(0);
            if (!markerData.marker.isPopupOpen()) {
              row.classList.remove('active');
            }
          }
        });
        
        markersTableBody.appendChild(row);
      }
    });
    
    // Update count in the header if exists
    const countElement = document.getElementById('visible-count');
    if (countElement) {
      countElement.textContent = visibleMarkers;
    }
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
      
      // Highlight the clicked row
      const allRows = markersTableBody.querySelectorAll('tr');
      allRows.forEach(r => r.classList.remove('highlight'));
      row.classList.add('highlight');
      
      // Center the map on this marker
      map.setView([lat, lng], 17);
      
      // Open the popup
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
      showToast('Please select a county and town first.', 'error');
      return;
    }
    
    if (markers.length === 0) {
      showToast('No marker data to save.', 'error');
      return;
    }
    
    const saveButton = document.getElementById('saveNotesButton');
    showLoading(saveButton, 'Saving...');
    
    // Create an array of objects for each marker
    const notes = markers.map(marker => ({
      name: marker.name,
      address: marker.address,
      notes: marker.notes || ''
    }));
    
    fetch(`/save-notes/${selectedCounty}/${selectedTown}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    })
      .then(response => {
        if (!response.ok) throw new Error('Failed to save notes');
        hideLoading(saveButton, 'Save Notes', 'fas fa-save');
        showToast('Notes saved successfully.');
      })
      .catch(error => {
        console.error('Error saving notes:', error);
        hideLoading(saveButton, 'Save Notes', 'fas fa-save');
        showToast('Failed to save notes. Please try again.', 'error');
      });
  };

  /**********************************
   *         PRINT PDF FUNCTION     *
   **********************************/
  const { jsPDF } = window.jspdf;
  const generatePDF = () => {
    if (!selectedCounty || !selectedTown) {
      showToast('Please select a county and town first.', 'error');
      return;
    }
    
    if (markers.length === 0) {
      showToast('No data to export.', 'error');
      return;
    }
    
    const printButton = document.getElementById('printPdfButton');
    showLoading(printButton, 'Generating...');
    
    // Capture the current map view using html2canvas with CORS enabled
    html2canvas(mapDiv, { 
      useCORS: true,
      scale: 2,
      logging: false,
      allowTaint: false
    }).then(canvas => {
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

      // Gather table data from the markers table.
      const rows = [];
      document.querySelectorAll('#markers-table tbody tr').forEach(row => {
        const cols = [];
        // Get index number
        cols.push(row.cells[0].innerText.trim());
        // Get name (remove icon)
        cols.push(row.cells[1].innerText.trim());
        // Get address (remove icon)
        cols.push(row.cells[2].innerText.trim());
        // Get notes from textarea
        const textarea = row.cells[3].querySelector('textarea');
        cols.push(textarea ? textarea.value : '');
        
        rows.push(cols);
      });
      
      const headers = ["#", "Name", "Address", "Notes"];

      const numbers = rows.map(r => parseInt(r[0], 10)).filter(n => !isNaN(n));
      const minNumber = numbers.length ? Math.min(...numbers) : 0;
      const maxNumber = numbers.length ? Math.max(...numbers) : 0;

      // Prepare title text: selected town (with ".xlsx" removed) and the range.
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

      // Use autoTable to add the addresses table into the left column.
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
          // On every page, add the map image to the right column.
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

      // Save the PDF
      pdf.save(`${townTitle}_Markers.pdf`);
      
      // Reset button
      hideLoading(printButton, 'Print PDF', 'fas fa-file-pdf');
      showToast(`PDF generated successfully.`);
    }).catch(error => {
      console.error('Error generating PDF:', error);
      hideLoading(printButton, 'Print PDF', 'fas fa-file-pdf');
      showToast('Failed to generate PDF. Please try again.', 'error');
    });
  };

  /**********************************
   *       CREATE UI BUTTONS        *
   **********************************/
  // Create and add controls container
  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'controls-container';
  
  // Add header with counter
  const header = document.createElement('div');
  header.className = 'panel-header';
  header.innerHTML = `
    <h4><i class="fas fa-map-marked-alt me-2"></i> Households on Map</h4>
    <div class="marker-counter">
      <span id="visible-count">0</span> locations visible
    </div>
  `;
  leftSide.insertBefore(header, leftSide.firstChild);
  
  // Create and add Save Notes button
  const saveButton = document.createElement('button');
  saveButton.id = 'saveNotesButton';
  saveButton.className = 'btn btn-primary';
  saveButton.innerHTML = '<i class="fas fa-save me-1"></i> Save Notes';
  saveButton.title = 'Save notes for all markers';
  saveButton.addEventListener('click', saveNotes);
  
  // Create and add Print PDF button
  const printButton = document.createElement('button');
  printButton.id = 'printPdfButton';
  printButton.className = 'btn btn-primary';
  printButton.innerHTML = '<i class="fas fa-file-pdf me-1"></i> Print PDF';
  printButton.title = 'Generate PDF of visible markers';
  printButton.addEventListener('click', generatePDF);
  
  // Add buttons to container
  controlsContainer.appendChild(saveButton);
  controlsContainer.appendChild(printButton);
  
  // Add export info
  const exportInfo = document.createElement('div');
  exportInfo.className = 'export-info';
  exportInfo.innerHTML = '<i class="fas fa-info-circle me-1"></i> The PDF will include only the markers visible on the current map view.';
  controlsContainer.appendChild(exportInfo);
  
  // Add container to side panel
  leftSide.appendChild(controlsContainer);

  /**********************************
   *       MAP EVENT HANDLERS       *
   **********************************/
  map.on('moveend zoomend', updateBounds);

  map.on('boxzoomend', (e) => {
    const boxBounds = e.boxZoomBounds;
    const rows = Array.from(markersTableBody.querySelectorAll('tr'));
    const selectedRows = [];
    const otherRows = [];
    
    rows.forEach(row => {
      const lat = parseFloat(row.dataset.lat);
      const lng = parseFloat(row.dataset.lng);
      
      if (boxBounds.contains([lat, lng])) {
        row.classList.add('boxed');
        selectedRows.push(row);
      } else {
        row.classList.remove('boxed', 'highlight');
        otherRows.push(row);
      }
    });
    
    // Clear and re-append rows to place selected ones first
    markersTableBody.innerHTML = '';
    selectedRows.forEach(row => markersTableBody.appendChild(row));
    otherRows.forEach(row => markersTableBody.appendChild(row));
    
    if (selectedRows.length > 0) {
      showToast(`Selected ${selectedRows.length} locations`);
    }
  });

  /**********************************
   *         STYLE ADDITIONS        *
   **********************************/
  // Add custom CSS to enhance the UI
  const style = document.createElement('style');
  style.textContent = `
    /* General Layout Styles */
    body {
      font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #333;
    }
    
    #map {
      position: absolute;
      top: 0;
      bottom: 0;
      right: 0;
      left: 350px; /* Default width */
      transition: left 0.3s ease;
      box-shadow: -3px 0 10px rgba(0, 0, 0, 0.1);
      z-index: 1;
    }
    
    #dragMe {
      position: absolute;
      width: 10px;
      cursor: col-resize;
      background-color: #e9ecef;
      z-index: 999;
      top: 0;
      bottom: 0;
      left: 350px; /* Default width */
      transition: background-color 0.2s, left 0.3s ease;
    }
    
    #dragMe:hover, #dragMe.active {
      background-color: #007bff;
    }
    
    #dragMe::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 2px;
      height: 30px;
      background-color: rgba(255, 255, 255, 0.7);
      border-radius: 2px;
    }
    
    #side-panel {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 350px; /* Default width */
      background: white;
      overflow-y: auto;
      box-shadow: 2px 0 5px rgba(0, 0, 0, 0.05);
      padding: 0;
      display: flex;
      flex-direction: column;
      transition: width 0.3s ease;
      z-index: 2;
    }
    
    /* Header Styles */
    .panel-header {
      padding: 15px 20px;
      background-color: #f8f9fa;
      border-bottom: 1px solid #dee2e6;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .panel-header h4 {
      margin: 0;
      font-size: 1.2rem;
      color: #495057;
      font-weight: 600;
    }
    
    .marker-counter {
      background-color: #e9ecef;
      padding: 3px 10px;
      border-radius: 15px;
      font-size: 0.85rem;
      color: #495057;
      display: flex;
      align-items: center;
    }
    
    #visible-count {
      font-weight: bold;
      margin-right: 5px;
      color: #007bff;
    }
    
    /* Dropdown Styles */
    select.form-control, .form-select {
      padding: 8px 12px;
      border-radius: 5px;
      border: 1px solid #ced4da;
      background-color: white;
      font-size: 0.9rem;
      margin: 10px 20px;
      max-width: calc(100% - 40px);
      transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
    }
    
    select.form-control:focus, .form-select:focus {
      border-color: #80bdff;
      outline: 0;
      box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
    }
    
    /* Table Styles */
    #markers-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 0.85rem;
    }
    
    #markers-table th {
      position: sticky;
      top: 0;
      background-color: #f8f9fa;
      padding: 12px 10px;
      text-align: left;
      font-weight: 600;
      color: #495057;
      border-bottom: 2px solid #dee2e6;
      z-index: 5;
    }
    
    #markers-table td {
      padding: 10px;
      border-bottom: 1px solid #e9ecef;
      vertical-align: middle;
    }
    
    .marker-row {
      transition: background-color 0.2s, transform 0.1s;
    }
    
    .marker-row:hover {
      background-color: #f8f9fa;
    }
    
    .marker-row.active {
      background-color: #e9ecef;
    }
    
    .marker-row.highlight {
      background-color: #e6f2ff;
      border-left: 3px solid #007bff;
    }
    
    .marker-row.boxed {
      background-color: #fffde7;
      font-weight: 500;
    }
    
    .marker-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 24px;
      padding: 0 5px;
      border-radius: 12px;
      background-color: #007bff;
      color: white;
      font-weight: bold;
      font-size: 0.8rem;
    }
    
    .name-cell, .address-cell {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 150px;
    }
    
    .notes-cell {
      width: 40%;
    }
    
    .notes-textarea {
      width: 100%;
      padding: 8px;
      border: 1px solid #ced4da;
      border-radius: 4px;
      resize: vertical;
      min-height: 60px;
      font-size: 0.85rem;
      transition: border-color 0.15s ease-in-out;
    }
    
    .notes-textarea:focus {
      border-color: #80bdff;
      outline: 0;
      box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
    }
    
    /* Button Styles */
    .controls-container {
      margin-top: auto;
      padding: 15px 20px;
      border-top: 1px solid #dee2e6;
      background-color: #f8f9fa;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    
    .btn-primary {
      color: #fff;
      background-color: #007bff;
      border-color: #007bff;
      padding: 8px 16px;
      font-size: 0.9rem;
      border-radius: 5px;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    }
    
    .btn-primary:hover {
      background-color: #0069d9;
      border-color: #0062cc;
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }
    
    .btn-primary:active {
      background-color: #0062cc;
      border-color: #005cbf;
      transform: translateY(0);
      box-shadow: 0 2px 3px rgba(0, 0, 0, 0.1);
    }
    
    /* Info Text */
    .export-info {
      font-size: 0.8rem;
      color: #6c757d;
      margin-top: 10px;
      width: 100%;
    }
    
    /* Custom Marker Styles */
    .custom-marker {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .marker-image {
      width: 28px;
      height: 42px;
    }
    
    .marker-number {
      position: absolute;
      top: 5px;
      left: 0;
      width: 100%;
      text-align: center;
      color: white;
      font-weight: bold;
      font-size: 12px;
    }
    
    /* Popup Styles */
    .marker-popup {
      min-width: 200px;
    }
    
    .marker-popup h4 {
      font-size: 16px;
      margin: 0 0 8px 0;
      color: #3c4043;
    }
    
    .marker-popup p {
      margin: 0 0 8px 0;
      font-size: 14px;
      color: #5f6368;
    }
    
    .marker-popup hr {
      margin: 8px 0;
      border: 0;
      border-top: 1px solid #e8eaed;
    }
    
    .marker-popup .notes {
      font-style: italic;
      font-size: 13px;
      color: #5f6368;
    }
    
    /* Toast Notification Styles */
    #toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
    }
    
    .toast {
      display: flex;
      align-items: center;
      width: 300px;
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 10px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transform: translateX(120%);
      transition: transform 0.3s ease;
      background-color: white;
      border-left: 4px solid;
    }
    
    .toast.show {
      transform: translateX(0);
    }
    
    .toast-icon {
      margin-right: 12px;
      font-size: 20px;
    }
    
    .toast-success {
      border-left-color: #28a745;
    }
    
    .toast-success .toast-icon {
      color: #28a745;
    }
    
    .toast-error {
      border-left-color: #dc3545;
    }
    
    .toast-error .toast-icon {
      color: #dc3545;
    }
    
    /* Leaflet Map Customizations */
    .leaflet-popup-content-wrapper {
      border-radius: 8px;
      padding: 0;
      overflow: hidden;
    }
    
    .leaflet-popup-content {
      margin: 12px;
    }
    
    .leaflet-control-zoom {
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1) !important;
    }
    
    .leaflet-control-zoom a {
      background-color: white;
      color: #007bff;
    }
    
    .leaflet-control-zoom a:hover {
      background-color: #f8f9fa;
      color: #0056b3;
    }
    
    /* Responsive Adjustments */
    @media (max-width: 768px) {
      #side-panel {
        width: 300px;
      }
      
      #map, #dragMe {
        left: 300px;
      }
      
      .name-cell, .address-cell {
        max-width: 120px;
      }
    }
  `;
  document.head.appendChild(style);

  /**********************************
   *       INITIALIZATION           *
   **********************************/
  // Initialize town dropdown as disabled initially
  townDropdown.prop('disabled', true);
  
  // Load counties on page load
  loadCounties();
  
  // Initialize map
  map.whenReady(updateBounds);
};
