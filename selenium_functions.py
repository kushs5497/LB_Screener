import datetime
from time import sleep
from selenium import webdriver
import logging
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.common.alert import Alert
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException, UnexpectedAlertPresentException, NoSuchElementException, NoAlertPresentException

logging.basicConfig(level=logging.INFO, filename='log.txt', filemode='w')
logging.info('Log of Run on ' + str(datetime.datetime.now()))
GLOBAL_DRIVER_WAIT = 5



def web_driver(headless=True):
    options = webdriver.ChromeOptions()
    options.add_argument("--verbose")
    options.add_argument('--no-sandbox')
    if headless: options.add_argument('--headless')
    options.add_argument('--disable-dev-shm-usage')  # Overcome limited resource problems
    options.add_argument('--disable-gpu')  # GPU hardware acceleration is unnecessary in headless mode
    driver = webdriver.Chrome(options=options)
    
    return driver


def select_name_location(driver, name_identifier, location_identifier):
    try:
        name = WebDriverWait(driver, GLOBAL_DRIVER_WAIT).until(
            EC.visibility_of_element_located(
                (By.CSS_SELECTOR, name_identifier))
        ).text
        location = WebDriverWait(driver, GLOBAL_DRIVER_WAIT).until(
            EC.visibility_of_element_located(
                (By.CSS_SELECTOR, location_identifier))
        ).text
    except StaleElementReferenceException:
        logging.warning('StaleElementReferenceException... trying again')
        name, location = select_name_location(
            driver, name_identifier, location_identifier)
    except UnexpectedAlertPresentException:
        logging.warning('UnexpectedAlertPresentException... dismissing alert and returning None')
        text = None
        try: 
            alert = driver.switch_to.alert 
            text = alert.text
            alert.dismiss()
        except NoAlertPresentException:
            pass
        return UnexpectedAlertPresentException, text
    except Exception as e:
        return e, None

    return name, location


def search_lastname_town(town, link, search, data, driver):
    # starting_index = len(data)
    if driver.current_url != link:
        driver.get(link)

    try:
        search_xpath = "//tbody/tr[1]/td[5]/input[1]"
        button_xpath = "//tbody/tr[1]/td[6]/button[1]"
        WebDriverWait(driver, GLOBAL_DRIVER_WAIT).until(EC.element_to_be_clickable((By.XPATH, search_xpath))).clear()
        WebDriverWait(driver, GLOBAL_DRIVER_WAIT).until(EC.element_to_be_clickable((By.XPATH, search_xpath))).send_keys(search)
        WebDriverWait(driver, GLOBAL_DRIVER_WAIT).until(EC.element_to_be_clickable((By.XPATH, button_xpath))).click()
        
        
    except:
        logging.error(f'TimeoutException... Link: ({link}) may be invalid, returning None')
        return None

    page = 1
    while True:
        for i in range(2, 22):
            name_css_selector = f'div.gwt-DialogBox:nth-child(15) tr.dialogMiddle td.dialogMiddleCenter div.dialogMiddleCenterInner.dialogContent td:nth-child(1) table:nth-child(1) tbody:nth-child(2) tr:nth-child({i}) > td.valueColumn:nth-child(1)'
            location_css_selector = f'div.gwt-DialogBox:nth-child(15) tr.dialogMiddle td.dialogMiddleCenter div.dialogMiddleCenterInner.dialogContent td:nth-child(1) table:nth-child(1) tbody:nth-child(2) tr:nth-child({i}) > td.valueColumn:nth-child(2)'
            name, location = select_name_location(driver, name_css_selector, location_css_selector)
            if name == UnexpectedAlertPresentException:
                logging.warning(f'UnexpectedAlertPresentException" \'{location}\'... Warning at Town: {town}, Link: {link}, Search: {search}, Page: {page}, Index: {i}')
                return data
            elif isinstance(name, Exception) and location is None:
                logging.error(f'Name or Location not found: Error: {name}, Town: {town}, Link: {link}, Search: {search}, Page: {page}, Index: {i}')
                continue
            elif name.lower().split(',')[0].split(' ')[0].lower() == search.lower():
                data.append([name, location, town, search])
            else:
                close_button_rel_xpath = "//button[contains(text(),'Close')]"
                close_button_css_selector = 'div.gwt-DialogBox:nth-child(15) tr.dialogMiddle td.dialogMiddleCenter div.dialogMiddleCenterInner.dialogContent td:nth-child(1) table:nth-child(1) tbody:nth-child(1) tr:nth-child(1) > td:nth-child(3)'
                try:
                    WebDriverWait(driver, GLOBAL_DRIVER_WAIT).until(EC.element_to_be_clickable((By.CSS_SELECTOR, close_button_css_selector))).click()
                except:
                    logging.warning(f'Close button not found for County: {town}, Link: {link}, Search: {search}')
                    driver.get(link)
                return data

        
        try:
            button_xpath = "/html/body/div[2]/div/table/tbody/tr[2]/td[2]/div/table/tbody/tr[2]/td/table/tbody/tr/td[2]/button"
            next_button_css_selector = 'div.gwt-DialogBox:nth-child(15) tr.dialogMiddle td.dialogMiddleCenter div.dialogMiddleCenterInner.dialogContent td:nth-child(1) table:nth-child(1) tbody:nth-child(1) tr:nth-child(1) > td:nth-child(2)'
            WebDriverWait(driver, GLOBAL_DRIVER_WAIT).until(EC.element_to_be_clickable((By.XPATH, button_xpath))).click()
        except:
            logging.error(f'Next button not found for County: {town}, Link: {link}, Search: {search}, Page: {page}')
            return data
        page = page + 1

