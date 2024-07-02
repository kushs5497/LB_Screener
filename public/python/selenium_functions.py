from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException, UnexpectedAlertPresentException, NoSuchElementException

def web_driver():
    options = webdriver.ChromeOptions()
    options.add_argument("--verbose")
    options.add_argument('--no-sandbox')
    options.add_argument('--headless')
    options.add_argument('--disable-dev-shm-usage')  # Overcome limited resource problems
    options.add_argument('--disable-gpu')  # GPU hardware acceleration is unnecessary in headless mode
    driver = webdriver.Chrome(options=options)
    
    return driver


def select_name_location(driver, name_identifier, location_identifier):
    try:
        name = WebDriverWait(driver, 10).until(
            EC.visibility_of_element_located(
                (By.CSS_SELECTOR, name_identifier))
        ).text
        location = WebDriverWait(driver, 10).until(
            EC.visibility_of_element_located(
                (By.CSS_SELECTOR, location_identifier))
        ).text
    except StaleElementReferenceException:
        name, location = select_name_location(
            driver, name_identifier, location_identifier)
    except (TimeoutException, UnexpectedAlertPresentException, NoSuchElementException):
        return None, None

    return name, location


def search_lastname_town(town, link, search, data, driver):
    starting_index = len(data)
    # driver = web_driver()
    if driver.current_url != link:
        driver.get(link)

    try:
        search_xpath = "//tbody/tr[1]/td[5]/input[1]"
        button_xpath = "//tbody/tr[1]/td[6]/button[1]"
        WebDriverWait(driver, 10).until(EC.element_to_be_clickable((By.XPATH, search_xpath))).clear()
        WebDriverWait(driver, 10).until(EC.element_to_be_clickable((By.XPATH, search_xpath))).send_keys(search)
        WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, button_xpath))).click()
    except TimeoutException:
        return data

    page = 1
    while True:
        for i in range(2, 22):
            name_css_selector = f'div.gwt-DialogBox:nth-child(15) tr.dialogMiddle td.dialogMiddleCenter div.dialogMiddleCenterInner.dialogContent td:nth-child(1) table:nth-child(1) tbody:nth-child(2) tr:nth-child({i}) > td.valueColumn:nth-child(1)'
            location_css_selector = f'div.gwt-DialogBox:nth-child(15) tr.dialogMiddle td.dialogMiddleCenter div.dialogMiddleCenterInner.dialogContent td:nth-child(1) table:nth-child(1) tbody:nth-child(2) tr:nth-child({i}) > td.valueColumn:nth-child(2)'
            name, location = select_name_location(
                driver, name_css_selector, location_css_selector)

            if name is None or location is None:
                continue
            else:
                data.append([name, location, town, search])

        if data[-1][0].split(',')[0].lower() != search.lower():
            break

        button_xpath = "/html/body/div[2]/div/table/tbody/tr[2]/td[2]/div/table/tbody/tr[2]/td/table/tbody/tr/td[2]/button"
        WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, button_xpath))).click()
        page = page + 1

    close_button_rel_xpath = "//button[contains(text(),'Close')]"
    try:
        WebDriverWait(driver, 10).until(EC.element_to_be_clickable((By.XPATH, close_button_rel_xpath))).click()
    except:
        print(f'Close button not found for County: {town}, Link: {link}, Search: {search}')

    def keep_row(tuple, search):
        return tuple[0].split(',')[0].lower() == search.lower()
    
    data = data[:starting_index] + [d for d in data[starting_index:] if keep_row(d, search)]

    # print(search, data)

    return data
