import selenium_functions as sf
import pandas as pd

''' Testing Because the First 3 were being skipped
town = 'Burlington'
link = 'https://wipp.edmundsassoc.com/Wipp/?wippid=0306'
search = 'soni'
data = []
driver = sf.web_driver(headless=False)
data = sf.search_lastname_town(town, link, search, data, driver)
df = pd.DataFrame(data)
print(df)
'''

town = 'Montgomery'
link = 'https://wipp.edmundsassoc.com/Wipp/?wippid=1813'
seach_list=['soni','patel','shah','kumar']
data = []
driver = sf.web_driver(headless=False)
for search in seach_list:
     data = sf.search_lastname_town(town, link, search, data, driver)
df = pd.DataFrame(data)
print(df)