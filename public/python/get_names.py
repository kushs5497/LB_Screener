import os
from tqdm import tqdm
import requests
import pandas as pd
from io import StringIO
from tabulate import tabulate
import selenium_functions as sf

url = 'https://docs.google.com/spreadsheets/d/1yQ-LfAp9KOCq74p9xWGBWNt4fUvsMctUy9bLYCgvrJI/export?format=csv'
response = requests.get(url)
response.raise_for_status()

last_names = pd.read_csv(StringIO(response.text))

# print(tabulate(last_names.head(), headers='keys', tablefmt='rounded_grid'))
driver = sf.web_driver()

last_name_list = 'Full List'
counties_list = ['Burlington']
# last_names_to_itr = last_names[last_name_list]
last_names_to_itr = last_names[last_name_list][last_names[last_name_list].notna()]

for county in counties_list:
    try: links_df = pd.read_excel(f'Links_By_County/{county}.xlsx')
    except FileNotFoundError: 
        print(f'No links file found for {county}')
        continue
    print(f'County: {county}\n')
    skip_towns = False
    for index, row in links_df.iterrows():
        # if row['Link'] == 'https://wipp.edmundsassoc.com/Wipp/?wippid=0301': continue

        # ====================
        # Delete this section
        # ====================
        """ last_town_done = 'Willingboro Township'
        if row['Municipality'] == last_town_done:
            skip_towns = False
            continue
        elif skip_towns:
            continue """
        # ====================

        data = []
        print('\n' + row['Municipality'] + f' {index} of {links_df.shape[0]}')
        for name in tqdm(last_names_to_itr):
            data = sf.search_lastname_town(row['Municipality'], row['Link'], name, data, driver)

        df = pd.DataFrame(data, columns=["Owner Name", "Property Location", "Municipality", "Search"])

        if os.path.exists(f'Data_By_Towns/{county}/{row["Municipality"]}.xlsx'):
            df_2 = pd.read_excel(f'Data_By_Towns/{county}/{row["Municipality"]}.xlsx', index_col=0,header=0)
            df = df.merge(df_2, how='left', on=['Owner Name', 'Property Location', 'Municipality', 'Search'])

        df.to_excel(f'Data_By_Towns/{county}/{row["Municipality"]}.xlsx')
        data.clear()

driver.quit()