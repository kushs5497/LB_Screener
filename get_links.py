import os
import shutil
import requests
import pandas as pd
from tqdm import tqdm
from bs4 import BeautifulSoup

import folium
import googlemaps

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException, UnexpectedAlertPresentException, NoSuchElementException

import selenium_functions as sf

if not os.path.exists('Links_By_County'):
    os.makedirs('Links_By_County')

url = 'https://publicrecords.netronline.com/state/NJ'
response = requests.get(url)
html_content = response.content
soup = BeautifulSoup(html_content, 'html.parser')
counties_div = soup.find('div', class_='list-items light-bg')
counties = []

if counties_div:
    counties = [a.text.strip() for a in counties_div.find_all('a', class_='list-item')]

counties_col = []
municipalities = []
links = []
dict_county_to_wipp_code = {}
url_head = 'https://wipp.edmundsassoc.com/Wipp/?wippid='

for county in counties:
    # print(county)
    url = ''
    if county == 'Union':
        url = f'https://publicrecords.netronline.com/directory/nj_numbers_Union'
    else:
        temp_county_name = county.replace(' ', '').lower()
        url = f'https://publicrecords.netronline.com/directory/nj_numbers_{temp_county_name}'
    response = requests.get(url)
    html_content = response.content
    soup = BeautifulSoup(html_content, 'html.parser')

    table = soup.find('table', class_='table table-striped')
    if not table:
        print(f"No table found for {county}")
        continue

    # Iterate through each row in the table body
    for row in table.find('tbody').find_all('tr'):
        columns = row.find_all('td')
        municipality = columns[0].text.strip()
        link_tag = columns[3].find('a')
        link = link_tag['href'] if link_tag else ''

        counties_col.append(county)
        municipalities.append(municipality)
        if link.startswith(url_head):
            wipp_code = link.split('=')[-1][:2]
            dict_county_to_wipp_code[county] = wipp_code
        links.append(link)

if not os.path.exists('Data_By_Towns'):
    os.makedirs('Data_By_Towns')

for county in counties:
    if not os.path.exists(f'Data_By_Towns/{county}'):
        os.makedirs(f'Data_By_Towns/{county}')

df = pd.DataFrame({
        'County': counties_col,
        'Municipality': municipalities,
        'Link': links
})

county_indexer = {}
for county in counties:
    county_indexer[county] = 0

for index, row in df.iterrows():
    county_indexer[row["County"]] += 1
    if not row['Link'].startswith(url_head):
        row['Link'] = f'{url_head}{dict_county_to_wipp_code[row["County"]]}{county_indexer[row["County"]]:02}'

print(county_indexer)
df.to_excel(f'links.xlsx')

driver = sf.web_driver()
links_with_exception = []

for index in tqdm(range(df.shape[0])):
    row = df.iloc[[index]]
    try:
        url = row['Link'].values[0]
        driver.get(url)
        css_selector = "table.rootPanel:nth-child(13) table.titlePanel tr:nth-child(1) td:nth-child(1) div.gwt-HTML div:nth-child(1) > img:nth-child(1)"
                       #table.rootPanel:nth-child(13) table.titlePanel tr:nth-child(1) td:nth-child(1) div.gwt-HTML div:nth-child(1) > img:nth-child(1)
        WebDriverWait(driver, 5).until(EC.presence_of_element_located((By.CSS_SELECTOR, css_selector)))
    except (StaleElementReferenceException, TimeoutException, UnexpectedAlertPresentException, NoSuchElementException):
        links_with_exception.append(row['Link'])

driver.quit()

df = df[~df['Link'].isin(links_with_exception)]

UniqueNames = df.County.unique()
DataFrameDict = {elem : pd.DataFrame() for elem in UniqueNames}
for key in DataFrameDict.keys():
    DataFrameDict[key] = df[:][df.County == key]
    DataFrameDict[key].to_excel(f'Links_By_County/{key}.xlsx')