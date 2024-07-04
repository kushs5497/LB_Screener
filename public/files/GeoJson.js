 // Fetch GeoJSON data file in the same directory as this script
 colors_cycle = ['#f59042','#42f59e','#42adf5','#f542ec']
 color_index = 0
 fetch('county_borders.geojson')
     .then(response => response.json())
     .then(data => {
         L.geoJSON(data, {
             style: function (feature) {
                 color_index = (color_index + 1) % colors_cycle.length;
                 return {
                     color: colors_cycle[color_index], // Outline color
                     weight: 2,
                     opacity: 0.4
                 };
             },
             onEachFeature: function (feature, layer) {
                 layer.bindTooltip(feature.name, {
                     permanent: false,
                     sticky: true,
                     direction: 'auto',
                     className: 'county-tooltip'
                 });
                 layer.on({
                     click: function (e) {
                         var layerBounds = layer.getBounds();
                         map.fitBounds(layerBounds);
                         highlightCounty(feature.name);
                     }
                 });
             }
         }).addTo(map);
     })
     .catch(error => console.error('Error fetching GeoJSON data:', error));

 function highlightCounty(countyName) {
     $('#countyDropdown').val(countyName).trigger('change');
 }