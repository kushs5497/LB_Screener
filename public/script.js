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
      if (newWidth > 100 && newWidth < window.innerWidth - 100) {
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
    const createNumberedDefaultIcon = (number) => {
      const iconUrl = 'map-marker.png'; // Ensure this file exists in your project
      return L.divIcon({
        html: `
          <div style="position: relative; width: 25px; height: 41px; overflow: hidden;">
            <img src="${iconUrl}" style="width: 25px; height: 41px;">
            <div style="position: absolute; top: 0; left: 0; width: 25px; height: 25px;
                        display: flex; align-items: center; justify-content: center;">
              <span style="color: white; font-size: 16px; font-weight: bold;">
                ${number}
              </span>
            </div>
          </div>
        `,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
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
              markers.push({
                latlng: [row[6], row[5]], // Adjust indices if needed
                name: row[0],
                address: row[1],
                notes: row[8] || '',
                marker: null
              });
            }
  
            if (markers.length > 0) {
              const bounds = L.latLngBounds(markers.map(marker => marker.latlng));
              map.fitBounds(bounds);
            }
  
            markers.forEach((markerData, index) => {
              const numberedIcon = createNumberedDefaultIcon(index + 1);
              const marker = L.marker(markerData.latlng, { icon: numberedIcon })
                .addTo(map)
                .bindPopup(`<b>${markerData.name}</b><br>${markerData.address}<hr><i>${markerData.notes}</i>`);
              marker.on('click', () => {
                map.panTo(marker.getLatLng());
                updateBounds();
                marker.openPopup();
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
          const numberCell = document.createElement('td');
          numberCell.textContent = index + 1;
          row.appendChild(numberCell);
  
          const nameCell = document.createElement('td');
          nameCell.textContent = markerData.name;
          row.appendChild(nameCell);
  
          const addressCell = document.createElement('td');
          addressCell.textContent = markerData.address;
          row.appendChild(addressCell);
  
          const notesCell = document.createElement('td');
          notesCell.innerHTML = `<textarea>${markerData.notes}</textarea>`;
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
        const markerData = markers[row.dataset.index];
        map.setView([lat, lng], 17);
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
          // Use the marker object to get name and address
          const markerObj = markers[index];
          if (textarea) {
            notes.push({
              name: markerObj.name,
              address: markerObj.address,
              notes: textarea.value
            });
          } else {
            notes.push({
              name: markerObj.name,
              address: markerObj.address,
              notes: ''
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
    
      const saveButton = document.createElement('button');
      saveButton.classList.add('btn');
      saveButton.textContent = 'Save Notes';
      saveButton.style.marginTop = "10px";
      saveButton.addEventListener('click', saveNotes);
      document.getElementById('side-panel').appendChild(saveButton);
  
    /**********************************
     *         PRINT PDF FUNCTION     *
     **********************************/
    // This function uses html2canvas to capture the mapDiv, then creates a PDF
    // with a two‑column layout: the addresses table on the left and the map on the right.
    const { jsPDF } = window.jspdf;
    const generatePDF = () => {
      // Capture the current map view using html2canvas with CORS enabled
      html2canvas(mapDiv, { useCORS: true }).then(canvas => {
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
          const cols = Array.from(row.children).map(cell => cell.innerText);
          rows.push(cols);
        });
        const headers = ["#", "Name", "Address", "Notes"];
  
        const numbers = rows.map(r => parseInt(r[0], 10)).filter(n => !isNaN(n));
        const minNumber = numbers.length ? Math.min(...numbers) : 0;
        const maxNumber = numbers.length ? Math.max(...numbers) : 0;

        // Prepare title text: selected town (with ".xlsx" removed) and the range.
        const townTitle = selectedTown ? selectedTown.replace(/\.xlsx$/, '') : "Town";
        const titleText = `${townTitle}: ${minNumber} - ${maxNumber}`;

        pdf.setFontSize(16);
        // Place the title at the top left.
        pdf.text(titleText, 10, 15);

  
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
          }
        });
  
        pdf.save("Markers_List.pdf");
      });
    };
  
    const printButton = document.createElement('button');
    printButton.classList.add('btn');
    printButton.textContent = 'Print PDF';
    printButton.style.marginTop = "10px";
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
          row.style.fontWeight = 'bold';
          selectedRows.push(row);
        } else {
          row.style.fontWeight = 'normal';
          otherRows.push(row);
        }
      });
      markersTableBody.innerHTML = '';
      selectedRows.forEach(row => markersTableBody.appendChild(row));
      otherRows.forEach(row => markersTableBody.appendChild(row));
    });
  
    map.whenReady(updateBounds);
  };
  