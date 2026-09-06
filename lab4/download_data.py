from pathlib import Path
from datasets import load_dataset
import pandas as pd

# 定位输出路径
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data" if BASE_DIR.name == "lab4" else BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
output_file = DATA_DIR / "lab4_raw_tweets.csv"

print("正在从 Hugging Face 获取官方推文数据集 (tweet_eval)...")
# 加载 tweet_eval 真实社交媒体推文训练集
dataset = load_dataset("cardiffnlp/tweet_eval", "sentiment", split="train")

# 取前 1,200 条（满足 Assignment ≥ 1,000 条要求）
texts = dataset["text"][:1200]

# 模拟真实采集的杂乱结构化字段（包含时间戳、互动量、用户名和主题分类）
import numpy as np

np.random.seed(42)
n = len(texts)

dates = pd.date_range("2023-10-01 08:00:00", periods=n, freq="11min")
categories = np.random.choice(["Tech", "Gaming", "News", "Sports", "General"], size=n)
retweets = np.random.exponential(scale=5, size=n).astype(int)
likes = (retweets * np.random.uniform(1.5, 4.0, size=n)).astype(int)

df = pd.DataFrame({
    "tweet_id": range(10001, 10001 + n),
    "created_at": [d.strftime("%Y-%m-%d %H:%M:%S") for d in dates],
    "username": [f"user_{i}" for i in range(n)],
    "tweet_text": texts,
    "likes": likes,
    "retweets": retweets,
    "category": categories,
    "location": np.random.choice(["US", "UK", "Canada", "Global"], size=n),
})

df.to_csv(output_file, index=False, encoding="utf-8")
print(f"成功保存原始推文数据集至：{output_file}，共 {len(df)} 行。")