import googlemaps
import pandas as pd
import os
import os
from tqdm import tqdm
import time
import requests
import pandas as pd
from io import StringIO
from tabulate import tabulate
import selenium_functions as sf
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging

# gmaps = googlemaps.Client(key='*****')
gmaps = googlemaps.Client(key='*****')

counties_list = ['Burlington']
api_call_count = 0

for county in counties_list:
    municipalities = pd.read_excel(f'Links_By_County/{county}.xlsx', header=0)['Municipality'].tolist()
    for municipality in municipalities:
        print(municipality)
        try:
            df = pd.read_excel(f'Data_By_Towns/{county}/{municipality}.xlsx', index_col=0,header=0)
        except:
            df = pd.read_csv(f'Data_By_Towns/{county}/{municipality}.csv', index_col=0,header=0)

        if df.empty: continue

        marker_list_str = []
        latitudes = []
        longitudes = []

        for index, row in df.iterrows():
            try:
                lat = row['Latitude']
                lng = row['Longitude']
                print(lat,lng)
            except:
                address = f'{row["Property Location"].lower()}, {row["Municipality"].lower()}, NJ'
                geocode = gmaps.geocode(address)
                api_call_count += 1
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
        df.to_excel(f'Data_By_Towns/{county}/{municipality}_.xlsx')
        print(municipality)


print(f'API call count: {api_call_count}')