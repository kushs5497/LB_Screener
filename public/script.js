window.onload = function () {
    const resizer = document.getElementById('dragMe');
    const leftSide = document.getElementById('side-panel');
    const mapDiv = document.getElementById('map');

    let startX = 0;
    let startWidth = 0;
    let selectedCounty = null;
    let selectedTown = null;

    const mouseDownHandler = function (e) {
        startX = e.clientX;
        startWidth = parseInt(document.defaultView.getComputedStyle(leftSide).width, 10);

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
    };

    resizer.addEventListener('mousedown', mouseDownHandler);

    const mouseMoveHandler = function (e) {
        const dx = e.clientX - startX;
        const newWidth = startWidth + dx;

        if (newWidth > 100 && newWidth < window.innerWidth - 100) {
            leftSide.style.width = `${newWidth}px`;
            mapDiv.style.left = `${newWidth}px`; // Move the map along with the side panel
            resizer.style.left = `${newWidth}px`; // Move the resizer along with the side panel

            map.invalidateSize(); // Invalidate map size to update its layout
            updateBounds(); // Update bounds based on new map size
        }

        resizer.style.cursor = 'col-resize';
        document.body.style.cursor = 'col-resize';
        leftSide.style.userSelect = 'none';
        leftSide.style.pointerEvents = 'none';
    };

    const mouseUpHandler = function () {
        resizer.style.removeProperty('cursor');
        document.body.style.removeProperty('cursor');
        leftSide.style.removeProperty('user-select');
        leftSide.style.removeProperty('pointer-events');

        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
    };

    // Initialize Leaflet map
    var map = L.map('map').setView([40.058323, -74.405663], 8.5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    var markers = [];

    // Fetch counties and populate dropdown
    $.get('/list-counties', function (counties) {
        var dropdown = $('#countyDropdown');
        dropdown.empty(); // Clear existing options
        var option = $('<option></option>').attr('value', "Select a County...").text("Select a County...");
        dropdown.append(option);
        counties.forEach(function (county) {
            var option = $('<option></option>').attr('value', county).text(county);
            dropdown.append(option);
        });
    });

    // Handle change event on county dropdown
    $('#countyDropdown').change(function () {
        selectedCounty = $(this).val();
        if (selectedCounty === 'Select a County...') {
            $('#townDropdown').empty();
            $('#townDropdown').append($('<option></option>').attr('value', null).text('Select a Town...'));
            selectedCounty = null;
        } else {
            // Fetch list of towns for the selected county
            $.get('/list-towns/' + selectedCounty, function (towns) {
                var dropdown = $('#townDropdown');
                dropdown.empty(); // Clear existing options
                dropdown.append($('<option></option>').attr('value', null).text('Select a Town...'));
                towns.forEach(function (town) {
                    var option = $('<option></option>').attr('value', town).text(town.replace('.xlsx', ''));
                    dropdown.append(option);
                });
            });
        }
    });

    // Function to clear existing markers from the map
    function clearMarkers() {
        markers.forEach(function (markerData) {
            if (markerData.marker) {
                map.removeLayer(markerData.marker);
            }
        });
        markers = []; // Reset markers array
    }

    $('#townDropdown').change(function () {
        selectedTown = $(this).val();
        if (selectedCounty && selectedTown) {
            clearMarkers(); // Clear old markers

            fetch(`/files/Data_By_Towns_Index/${selectedCounty}/${selectedTown}`)
                .then(response => response.arrayBuffer())
                .then(data => {
                    var workbook = XLSX.read(data, { type: 'array' });
                    var firstSheetName = workbook.SheetNames[0];
                    var worksheet = workbook.Sheets[firstSheetName];
                    var json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    markers = []; // Reset markers array
                    for (var i = 1; i < json.length; i++) {
                        var row = json[i];
                        var marker = {
                            latlng: [row[5], row[6]],
                            name: row[1],
                            address: row[2],
                            notes: row[7] || '',
                            marker: null
                        };
                        markers.push(marker);
                    }

                    if (markers.length != 0) {
                        var bounds = L.latLngBounds(markers.map(function (marker) {
                            return marker.latlng;
                        }));
                        map.fitBounds(bounds);
                    }

                    markers.forEach(function (markerData) {
                        var iconOptions = {
                            icon: L.icon({
                                iconUrl: markerData.notes ? 'red-marker-icon.png' : 'default-marker-icon.png',
                                iconSize: [25, 41],
                                iconAnchor: [12, 41],
                                popupAnchor: [1, -34],
                                shadowSize: [41, 41]
                            })
                        };

                        

                        var marker = L.marker(markerData.latlng).addTo(map)
                            .bindPopup('<b>' + markerData.name + '</b><br>' + markerData.address + '<hr><i>' + markerData.notes + '</i>');
                        marker.on('click', function () {
                            map.panTo(marker.getLatLng());
                            updateBounds();
                            marker.openPopup();
                        });
                        if (markerData.notes) marker._icon.style.filter = "hue-rotate(120deg)"
                        markerData.marker = marker;
                    });
                    updateBounds(); // Update bounds after adding markers
                })
                .catch(error => console.error('Error fetching or processing data:', error));
        }
    });

    function updateBounds() {
        var bounds = map.getBounds();

        var markersTableBody = document.querySelector('#markers-table tbody');
        markersTableBody.innerHTML = '';
        markers.forEach(function (markerData) {
            if (bounds.contains(markerData.latlng)) {
                var row = document.createElement('tr');
                var nameCell = document.createElement('td');
                nameCell.textContent = markerData.name;
                var addressCell = document.createElement('td');
                addressCell.textContent = markerData.address;
                var notesCell = document.createElement('td');
                notesCell.innerHTML = `<textarea>${markerData.notes}</textarea>`;
                row.appendChild(nameCell);
                row.appendChild(addressCell);
                row.appendChild(notesCell);
                row.dataset.lat = markerData.latlng[0];
                row.dataset.lng = markerData.latlng[1];
                row.dataset.index = markers.indexOf(markerData);
                markersTableBody.appendChild(row);
            }
        });
    }

    document.querySelector('#markers-table tbody').addEventListener('click', function (e) {
        var target = e.target.closest('tr');
        if (target && e.target.tagName !== 'TEXTAREA') {
            var lat = parseFloat(target.dataset.lat);
            var lng = parseFloat(target.dataset.lng);
            var index = target.dataset.index;
            var markerData = markers[index];
            map.setView([lat, lng], 17);
            if (markerData && markerData.marker) {
                markerData.marker.openPopup();
            }
        }
    });

    function saveNotes() {
        if (!selectedCounty || !selectedTown) {
            alert('Please select a county and town first.');
            return;
        }

        const notes = [];
        document.querySelectorAll('#markers-table tbody tr').forEach(row => {
            const index = row.dataset.index;
            const textarea = row.querySelector('textarea');
            if (textarea) {
                markers[index].notes = textarea.value;
                notes.push(textarea.value);
            } else {
                notes.push('');
            }
        });

        fetch(`/save-notes/${selectedCounty}/${selectedTown}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ notes })
        }).then(response => {
            if (response.ok) {
                alert('Notes saved successfully.');
            } else {
                alert('Failed to save notes.');
            }
        }).catch(error => {
            console.error('Error saving notes:', error);
            alert('Failed to save notes.');
        });
    }

    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save Notes';
    saveButton.addEventListener('click', saveNotes);
    document.getElementById('side-panel').appendChild(saveButton);

    map.on('load moveend', updateBounds);

    map.on('boxzoomend', function (e) {
        var boxBounds = e.boxZoomBounds;
        var markersTableBody = document.querySelector('#markers-table tbody');
        var rows = Array.from(markersTableBody.querySelectorAll('tr'));

        var selectedRows = [];
        var otherRows = [];

        rows.forEach(function (row) {
            var lat = parseFloat(row.dataset.lat);
            var lng = parseFloat(row.dataset.lng);
            if (boxBounds.contains([lat, lng])) {
                row.style.fontWeight = 'bold';
                selectedRows.push(row);
            } else {
                row.style.fontWeight = 'normal';
                otherRows.push(row);
            }
        });

        markersTableBody.innerHTML = '';
        selectedRows.forEach(function (row) {
            markersTableBody.appendChild(row);
        });
        otherRows.forEach(function (row) {
            markersTableBody.appendChild(row);
        });
    });

    map.whenReady(updateBounds);
};
