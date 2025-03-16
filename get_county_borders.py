import requests
import json

url = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/us-county-boundaries/records?limit=21&refine=stusab%3A%22NJ%22'

response = requests.get(url)
data = response.json()

features_list = []
for feature in data['results']:
    feature['geo_shape']['name'] = feature['name']
    features_list.append(feature['geo_shape'])

geoJson_template = {
    "type": "FeatureCollection",
    "features": features_list
}

with open('public/county_borders.geojson', 'w') as f:
    json.dump(geoJson_template, f, indent=2)

