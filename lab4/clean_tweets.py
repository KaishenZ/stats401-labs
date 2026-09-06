import os
from pathlib import Path
import re
import nltk
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer
from nltk.tokenize import word_tokenize
import pandas as pd
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
import torch
from transformers import pipeline

# 锁定路径
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
RAW_DATA_PATH = DATA_DIR / "lab4_raw_tweets.csv"
CLEAN_DATA_PATH = DATA_DIR / "lab4_clean_tweets.csv"

# ==========================================
# 0. 读取原始数据 (已由 download_data.py 生成)
# ==========================================
if not RAW_DATA_PATH.exists():
    raise FileNotFoundError(
        f"未找到原始数据文件：{RAW_DATA_PATH}！请先运行 python download_data.py 生成数据集。"
    )

print(f"正在读取原始数据: {RAW_DATA_PATH}")
df = pd.read_csv(RAW_DATA_PATH)
print(f"初始记录数: {df.shape[0]} 条，包含字段: {list(df.columns)}")

# ==========================================
# Task 2 & 3: 处理缺失值与重复项
# ==========================================
# 核心文本必须存在，缺失直接剔除
df = df.dropna(subset=["tweet_text"])
# 按 tweet_id 去重
df = df.drop_duplicates(subset=["tweet_id"], keep="first")
# 填充互动量缺失值
df["retweets"] = df["retweets"].fillna(0)
df["likes"] = df["likes"].fillna(0)

# ==========================================
# Task 4 & 5: 类型修正与日期解析
# ==========================================
# 清理数字中可能存在的千分位逗号并转为整型
df["likes"] = (
    pd.to_numeric(
        df["likes"].astype(str).str.replace(",", "", regex=False),
        errors="coerce"
    )
    .fillna(0)
    .astype(int)
)
df["retweets"] = (
    pd.to_numeric(df["retweets"], errors="coerce")
    .fillna(0)
    .astype(int)
)
# 排除逻辑上不可能的负数
df.loc[df["retweets"] < 0, "retweets"] = 0
df.loc[df["likes"] < 0, "likes"] = 0

# 解析时间戳并派生结构化时间属性
df["created_at"] = pd.to_datetime(
    df["created_at"], errors="coerce", format="mixed"
)
df = df.dropna(subset=["created_at"])
df["date"] = df["created_at"].dt.date
df["hour"] = df["created_at"].dt.hour
df["weekday"] = df["created_at"].dt.day_name()

# ==========================================
# Task 6: 规范化文本与离散分类
# ==========================================
df["username"] = (
    df["username"]
    .astype("string")
    .str.strip()
    .str.replace(r"^@", "", regex=True)
    .str.lower()
)
df["tweet_text_raw"] = (
    df["tweet_text"]
    .astype("string")
    .str.replace(r"\s+", " ", regex=True)
    .str.strip()
)
df["category"] = df["category"].fillna("General").astype("string").str.strip()
df["location"] = df["location"].fillna("Global").astype("string").str.strip()

# ==========================================
# Task 7 - 10: TF-IDF 分支预处理
# ==========================================
print("正在检查并加载 NLTK 语言资源...")
for pkg in ["punkt", "punkt_tab", "stopwords", "wordnet", "omw-1.4"]:
    nltk.download(pkg, quiet=True)

def normalize_tweet(text):
    text = text.lower()
    text = re.sub(r"https?://\S+|www\.\S+", " URL ", text)
    text = re.sub(r"@\w+", " USER ", text)
    text = re.sub(r"\b\d+(?:\.\d+)?\b", " NUMBER ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

df["text_normalized"] = df["tweet_text_raw"].apply(normalize_tweet)
df["tokens"] = df["text_normalized"].apply(word_tokenize)

stop_words = set(stopwords.words("english"))
df["tokens_no_stop"] = df["tokens"].apply(
    lambda tokens: [t for t in tokens if t not in stop_words]
)

lemmatizer = WordNetLemmatizer()
df["tokens_clean"] = df["tokens_no_stop"].apply(
    lambda tokens: [lemmatizer.lemmatize(t) for t in tokens if t.isalpha()]
)
df["text_clean"] = df["tokens_clean"].apply(" ".join)

# 构建 TF-IDF 特征矩阵进行检验
tfidf_vectorizer = TfidfVectorizer(min_df=2, max_df=0.90)
tfidf = tfidf_vectorizer.fit_transform(df["text_clean"])
print(f"TF-IDF 构建完成，提取特征词汇量: {tfidf.shape[1]}")

# ==========================================
# Task 11 - 12: CardiffNLP RoBERTa 情感推断
# ==========================================
print("加载 CardiffNLP Twitter-RoBERTa 预训练情感模型...")
device = 0 if torch.cuda.is_available() else -1
sentiment_model = pipeline(
    "sentiment-analysis",
    model="cardiffnlp/twitter-roberta-base-sentiment-latest",
    top_k=None,
    device=device
)

def prepare_for_roberta(text):
    text = str(text)
    text = re.sub(r"@\w+", "@user", text)
    text = re.sub(r"https?://\S+|www\.\S+", "http", text)
    return text.strip()

df["sentiment_text"] = df["tweet_text_raw"].apply(prepare_for_roberta)

print("正在批量运行 RoBERTa 情感推断 (共 1200 条)...")
results = sentiment_model(
    df["sentiment_text"].tolist(),
    truncation=True,
    batch_size=32
)

def scores_to_dict(scores):
    return {item["label"].lower(): item["score"] for item in scores}

score_dicts = [scores_to_dict(scores) for scores in results]

df["sentiment_negative"] = [s.get("negative", 0.0) for s in score_dicts]
df["sentiment_neutral"] = [s.get("neutral", 0.0) for s in score_dicts]
df["sentiment_positive"] = [s.get("positive", 0.0) for s in score_dicts]

df["sentiment"] = [
    max(s, key=s.get).capitalize()
    for s in score_dicts
]
# 连续情感分 [-1, 1]
df["sentiment_score"] = df["sentiment_positive"] - df["sentiment_negative"]

# ==========================================
# Task 13: 导出规整化 (Tidy) 可视化数据
# ==========================================
vis_cols = [
    "tweet_id",
    "created_at",
    "date",
    "hour",
    "weekday",
    "username",
    "category",
    "location",
    "tweet_text_raw",
    "text_clean",
    "likes",
    "retweets",
    "sentiment_negative",
    "sentiment_neutral",
    "sentiment_positive",
    "sentiment_score",
    "sentiment"
]
vis_df = df[vis_cols].copy()
vis_df.to_csv(CLEAN_DATA_PATH, index=False)
print(f"数据清洗与情感分析全部完成！已成功导出至: {CLEAN_DATA_PATH}，总有效记录数: {len(vis_df)}")