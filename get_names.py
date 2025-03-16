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

start_time = time.time()
csv_save = True

# Function to process each town
def process_town(county, row, index, last_names_to_itr):
    driver = sf.web_driver()
    data = []
    municipality = row['Municipality']
    description = f'{municipality} {index} of {links_df.shape[0]}'
    spaces = ' ' * (35 - len(description))
    for name in tqdm(last_names_to_itr, desc=f'{description}{spaces}'):
        search_results = sf.search_lastname_town(row['Municipality'], row['Link'], name, data, driver)
        if search_results is None: 
            logging.warning(f'No results found for {county}/{row["Municipality"]}/{name}')
            break
        data = search_results

    df = pd.DataFrame(data, columns=["Owner Name", "Property Location", "Municipality", "Search"])
    #if os.path.exists(f'Data_By_Towns/{county}/{row["Municipality"]}.xlsx'):
        #df_2 = pd.read_excel(f'public/files/Data_By_Towns_Index/{county}/{row["Municipality"]}.xlsx', index_col=0,header=0)
        #df = df.merge(df_2, how='left', on=['Owner Name', 'Property Location', 'Municipality', 'Search'])
        #logging.info(f'Appending to {county}/{row["Municipality"]}.xlsx')

    df.reset_index()
    os.makedirs(f'Data_By_Towns/{county}', exist_ok=True)
    df.to_csv(f'Data_By_Towns/{county}/{row["Municipality"]}.csv')
    # df.to_excel(f'Data_By_Towns/{county}/{row["Municipality"]}.xlsx')
    # df.to_csv(f'Data_By_Towns/{county}/{row["Municipality"]}.csv')
    
    data.clear()
    driver.quit()
    return f'Completed {row["Municipality"]}'

url = 'https://docs.google.com/spreadsheets/d/1yQ-LfAp9KOCq74p9xWGBWNt4fUvsMctUy9bLYCgvrJI/export?format=csv'
response = requests.get(url)
response.raise_for_status()
last_names = pd.read_csv(StringIO(response.text))
# print(tabulate(last_names.head(), headers='keys', tablefmt='rounded_grid'))
last_name_list = 'Full List'
counties_list = pd.read_excel("links.xlsx",header=0)['County'].unique()[7:]
last_names_to_itr = last_names[last_name_list][last_names[last_name_list].notna()]

for county in counties_list:
    try:
        links_df = pd.read_excel(f'Links_By_County/{county}.xlsx')
    except FileNotFoundError:
        logging.error(f'No links file found for {county}')
        # print(f'No links file found for {county}')
        continue
    print(f'County: {county}\n')

    print(f"Running {os.cpu_count()} threads...\n")
    with ThreadPoolExecutor(max_workers=os.cpu_count()) as executor:
        futures = [executor.submit(process_town, county, row, index, last_names_to_itr) for index, row in links_df.iterrows()]

        for future in as_completed(futures):
            logging.info(future.result())

end_time = time.time()
total_time = end_time - start_time
time.sleep(.5)
print(f'\nTotal time: {total_time}')