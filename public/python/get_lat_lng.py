import googlemaps
import pandas as pd
import os

# gmaps = googlemaps.Client(key='AIzaSyAs0368SuuGITdhBJkQew9XnU374PBYEBQ')
gmaps = googlemaps.Client(key='AIzaSyCBEKm6u4wUM80ocjXwhXrEE7GMiTQo_fQ')

counties_list = ['Burlington']

for file_county in counties_list:
    file_list_towns = os.listdir(f'Data_By_Towns/{file_county}')
    print(file_list_towns)
    for file in file_list_towns:
        if file.endswith('.html'): continue
        full_file = f'Data_By_Towns/{file_county}/{file}'
        df = pd.read_excel(full_file)
        if df.empty: continue

        marker_list_str = []
        latitudes = []
        longitudes = []

        for index, row in df.iterrows():
            print
            try:
                lat = row['Latitude']
                lng = row['Longitude']
            except:
                address = f'{row["Property Location"].lower()}, {row["Municipality"].lower()}, NJ'
                geocode = gmaps.geocode(address)
                if geocode:
                    lat = geocode[0]['geometry']['location']['lat']
                    lng = geocode[0]['geometry']['location']['lng']
                else:
                    lat = None
                    lng = None

            latitudes.append(lat)
            longitudes.append(lng)

        # Add latitude and longitude columns to the DataFrame
        df['Latitude'] = latitudes
        df['Longitude'] = longitudes

        # Save updated DataFrame back to Excel
        df.to_csv(f'Data_By_Towns/{file_county}/{file.split(".")[0]}.csv', index=False)
        print(file)
