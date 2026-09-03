import os
import time
import requests
import pandas as pd
from bs4 import BeautifulSoup

# ==========================================================
# Lab 3 Assignment: 自动化采集 1,000 条图书数据
# 数据源: Books to Scrape (https://books.toscrape.com/)
# 规格: 50 页 x 20 条/页 = 1,000 条
# 字段: title, price, rating, availability
# ==========================================================

headers = {
    "User-Agent": "STATS401-Class-Exercise/1.0"
}

# 文本星级转数字映射字典
RATING_MAP = {
    "One": 1,
    "Two": 2,
    "Three": 3,
    "Four": 4,
    "Five": 5
}

records = []
total_pages = 50  # 爬取全部 50 页，获取完整 1,000 本书

print(f"--- Starting scraping {total_pages} pages (Target: 1,000 records) ---")

for page in range(1, total_pages + 1):
    url = f"https://books.toscrape.com/catalogue/page-{page}.html"

    # 1. 网络请求与异常处理 (Requirement 6)
    try:
        response = requests.get(
            url,
            headers=headers,
            timeout=15
        )
        response.raise_for_status()
        response.encoding = "utf-8"

    except requests.RequestException as error:
        print(f"Error requesting page {page}: {error}")
        continue

    # 2. 解析 DOM 树
    soup = BeautifulSoup(response.text, "html.parser")
    items = soup.select("article.product_pod")

    # 3. 提取多个有用属性 (Requirement 3)
    for item in items:
        # 属性 1: 书名 (完整的 title 属性)
        title = item.select_one("h3 a")["title"]

        # 属性 2: 价格 (转为浮点数)
        price_text = item.select_one(".price_color").get_text(strip=True)
        clean_price = price_text.replace("£", "").replace("Â", "")
        price = float(clean_price)

        # 属性 3: 评分 (从 class 中提取 One/Two/Three/Four/Five 并转为 1-5 整数)
        rating_classes = item.select_one("p.star-rating")["class"]
        rating_str = [c for c in rating_classes if c != "star-rating"][0]
        rating = RATING_MAP.get(rating_str, 0)

        # 属性 4: 库存状态 (提取 In stock 文本)
        availability = item.select_one(".instock.availability").get_text(strip=True)

        records.append({
            "title": title,
            "price": price,
            "rating": rating,
            "availability": availability
        })

    print(f"Fetched page {page:02d}/50 | Total records collected: {len(records)}")

    # 4. 频率限制 (Requirement 5: 延迟 0.5 ~ 1 秒，保持礼貌)
    time.sleep(0.5)

print(f"\nScraping complete. Collected {len(records)} records in total.")

# 5. 保存数据集为 CSV (Requirement 7)
df = pd.DataFrame(records)

current_dir = os.path.dirname(os.path.abspath(__file__)) # lab3 目录
project_root = os.path.dirname(current_dir)              # stats401-labs 根目录
data_dir = os.path.join(project_root, "data")
os.makedirs(data_dir, exist_ok=True)

output_path = os.path.join(data_dir, "lab3_data.csv")
df.to_csv(output_path, index=False)

print(f"Dataset successfully saved to: {output_path}")
print(df.head())