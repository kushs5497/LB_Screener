window.onload = function () {
    const resizer = document.getElementById('dragMe');
    const leftSide = document.getElementById('side-panel');
    const mapDiv = document.getElementById('map');

    let startX = 0;
    let startWidth = 0;

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

    var map = L.map('map').setView([39.9872579, -74.96875349999999], 13);

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
        counties.forEach(function (county) {
            var option = $('<option></option>').attr('value', county).text(county);
            dropdown.append(option);
        });
    });

    // Handle change event on county dropdown
    $('#countyDropdown').change(function () {
        var selectedCounty = $(this).val();
        if (selectedCounty) {
            // Fetch list of towns for the selected county
            $.get('/list-towns/' + selectedCounty, function (towns) {
                var dropdown = $('#townDropdown');
                dropdown.empty(); // Clear existing options
                towns.forEach(function (town) {
                    var option = $('<option></option>').attr('value', town).text(town);
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

    var lat_sum = 0;
    var lng_sum = 0;
    var count_markers = 0;

    $('#townDropdown').change(function () {
        var selectedCounty = $('#countyDropdown').val();
        var selectedTown = $(this).val();
        if (selectedCounty && selectedTown) {
            clearMarkers(); // Clear old markers

            fetch(`/files/Data_By_Towns_Index/${selectedCounty}/${selectedTown}`)
                .then(response => response.arrayBuffer())
                .then(data => {
                    var workbook = XLSX.read(data, { type: 'array' }); // Use 'array' type instead of 'binary'
                    var firstSheetName = workbook.SheetNames[0];
                    var worksheet = workbook.Sheets[firstSheetName];
                    var json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    var min_lat = 90
                    var max_lat = -90
                    var min_lng = 180
                    var max_lng = -180
                    markers = []; // Reset markers array
                    for (var i = 1; i < json.length; i++) {
                        var row = json[i];

                        if (row[5]<min_lat) min_lat = row[5];
                        if (row[5]>max_lat) max_lat = row[5];
                        if (row[6]<min_lng) min_lng = row[6];
                        if (row[6]>max_lng) max_lng = row[6];

                        var marker = {
                            latlng: [row[5], row[6]],
                            name: row[1],
                            address: row[2],
                            marker: null
                        };
                        markers.push(marker);
                    }

                    map.setView([(min_lat+max_lat)/2, (min_lng+max_lng)/2], 13);

                    // Add new markers to the map
                    markers.forEach(function (markerData) {
                        var marker = L.marker(markerData.latlng).addTo(map)
                            .bindPopup('<b>' + markerData.name + '</b><br>' + markerData.address);
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
                row.appendChild(nameCell);
                row.appendChild(addressCell);
                row.dataset.lat = markerData.latlng[0];
                row.dataset.lng = markerData.latlng[1];
                row.dataset.index = markers.indexOf(markerData);
                markersTableBody.appendChild(row);
            }
        });
    }

    // Event listener for table row clicks
    document.querySelector('#markers-table tbody').addEventListener('click', function (e) {
        var target = e.target.closest('tr');
        if (target) {
            var lat = parseFloat(target.dataset.lat);
            var lng = parseFloat(target.dataset.lng);
            var index = target.dataset.index;
            var markerData = markers[index];
            map.setView([lat, lng], 17); // Center map on the selected marker
            if (markerData && markerData.marker) {
                markerData.marker.openPopup(); // Open the popup for the selected marker
            }
        }
    });



    // Update bounds on map load and move
    map.on('load moveend', updateBounds);

    // Initial bounds update
    map.whenReady(updateBounds);
}
