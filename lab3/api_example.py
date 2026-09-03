import os
import time
import requests
import pandas as pd

# ==========================================
# Task 11, 12, 13, 14: REST API 综合分页抓取
# ==========================================
base_url = "https://jsonplaceholder.typicode.com/posts"
headers = {
    "User-Agent": "STATS401-Class-Exercise/1.0"
}

all_posts = []
page = 1
limit_per_page = 20  # 每页取 20 条

print("--- Task 14: Starting API Pagination ---")

# 循环拉取多页数据
while True:
    params = {
        "_page": page,
        "_limit": limit_per_page
    }

    try:
        response = requests.get(
            base_url,
            headers=headers,
            params=params,
            timeout=10
        )
        response.raise_for_status()

    except requests.RequestException as error:
        print(f"Failed to fetch API page {page}: {error}")
        break

    page_data = response.json()

    # 终止条件 1：如果没有更多数据，跳出循环
    if not page_data:
        print(f"Page {page} returned empty list. Stopping pagination.")
        break

    print(f"Fetched page {page} with {len(page_data)} records: {response.url}")

    # 将当前页的记录提取关键字段并追加到总列表中
    for post in page_data:
        all_posts.append({
            "id": post["id"],
            "user_id": post["userId"],
            "title": post["title"]
        })

    # 终止条件 2：达到预期数量或测试上限 (例如达到 100 条)
    if len(all_posts) >= 100:
        print("Reached target record count limit.")
        break

    page += 1
    # 礼貌限流
    time.sleep(1)

print(f"\nTotal records collected via API pagination: {len(all_posts)}")

# ==========================================
# 保存分页聚合后的数据
# ==========================================
df = pd.DataFrame(all_posts)
print("\n--- Paginated API DataFrame Preview ---")
print(df.head())

os.makedirs("../data", exist_ok=True)
csv_path = "../data/posts.csv"
df.to_csv(csv_path, index=False)
print(f"\nUpdated paginated data to: {csv_path}")