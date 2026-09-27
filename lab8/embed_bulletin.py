"""Task 5–10: TF-IDF, embeddings, similarity, UMAP, and topic labels.

Semantic embeddings organize passages. TF-IDF is used only to interpret
the clusters, not to build the map.
"""

from pathlib import Path

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import umap

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
PASSAGE_PATH = DATA_DIR / "bulletin_passages.csv"
EMBED_PATH = DATA_DIR / "lab8_embeddings.npy"
MAP_PATH = DATA_DIR / "lab8_embedding_map.csv"
MATRIX_PATH = DATA_DIR / "lab8_topic_section_matrix.csv"
TERMS_PATH = DATA_DIR / "lab8_top_terms.csv"

# Assigned from centroid passages and TF-IDF terms (KMeans, random_state=401).
CLUSTER_LABELS = {
    0: "Politics and Global Affairs",
    1: "Natural Science and Computation",
    2: "Media and Arts",
    3: "Language and Communication",
    4: "China, History, and Culture",
    5: "University Policy and Transfer Credit",
    6: "Environment, Health, and Policy",
    7: "Credits, Load, and Grading",
}


def top_terms(vectorizer, matrix, row_mask, n=8):
    if row_mask.sum() == 0:
        return []
    weights = np.asarray(matrix[row_mask].mean(axis=0)).ravel()
    order = weights.argsort()[::-1][:n]
    names = vectorizer.get_feature_names_out()
    return [(names[i], float(weights[i])) for i in order if weights[i] > 0]


def main():
    df = pd.read_csv(PASSAGE_PATH)
    df["subsection"] = df["subsection"].fillna("")
    df["text_clean"] = df["text_clean"].fillna(df["text"])
    print(f"Passages: {len(df)}")

    vectorizer = TfidfVectorizer(
        stop_words="english",
        max_df=0.6,
        min_df=3,
        ngram_range=(1, 2),
    )
    tfidf = vectorizer.fit_transform(df["text_clean"])
    global_terms = top_terms(vectorizer, tfidf, np.ones(len(df), dtype=bool), n=20)
    pd.DataFrame(global_terms, columns=["term", "mean_tfidf"]).to_csv(TERMS_PATH, index=False)
    print("Top TF-IDF terms:", ", ".join(term for term, _ in global_terms[:12]))

    if EMBED_PATH.exists():
        embeddings = np.load(EMBED_PATH)
        print(f"Loaded embeddings {embeddings.shape}")
    else:
        model = SentenceTransformer("all-MiniLM-L6-v2")
        embeddings = model.encode(
            df["text_clean"].tolist(),
            normalize_embeddings=True,
            show_progress_bar=True,
            batch_size=64,
        )
        embeddings = np.asarray(embeddings, dtype=np.float32)
        np.save(EMBED_PATH, embeddings)
        print(f"Embeddings: {embeddings.shape}")

    similarity = cosine_similarity(embeddings)
    scores = similarity[0].copy()
    scores[0] = -1
    index = int(np.argmax(scores))
    print("\nNearest neighbor of the first passage")
    print(df.iloc[0]["text"][:280])
    print("---")
    print(df.iloc[index]["text"][:280])
    print("Similarity:", round(float(scores[index]), 3))

    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=15,
        min_dist=0.15,
        metric="cosine",
        random_state=401,
    )
    coords = reducer.fit_transform(embeddings)
    df["x"] = coords[:, 0]
    df["y"] = coords[:, 1]

    kmeans = KMeans(n_clusters=8, random_state=401, n_init="auto")
    df["cluster"] = kmeans.fit_predict(embeddings)

    print("\n===== CLUSTER PROFILES =====")
    for cluster in sorted(df["cluster"].unique()):
        mask = (df["cluster"] == cluster).to_numpy()
        subset = df[mask]
        terms = ", ".join(term for term, _ in top_terms(vectorizer, tfidf, mask, n=8))
        sections = subset["section"].value_counts().head(4)
        section_txt = "; ".join(f"{name} ({count})" for name, count in sections.items())
        print(f"\nCLUSTER {cluster}  n={mask.sum()}  {CLUSTER_LABELS.get(cluster, '')}")
        print("TF-IDF:", terms)
        print("Sections:", section_txt)
        for text in subset["text_clean"].head(6):
            print("-", text[:180])

    df["cluster_name"] = df["cluster"].map(
        lambda cluster: CLUSTER_LABELS.get(int(cluster), f"Topic {int(cluster)}")
    )

    neighbor_ids = []
    for row in range(len(df)):
        order = np.argsort(-similarity[row])
        picked = [df.iloc[j]["passage_id"] for j in order if j != row][:5]
        neighbor_ids.append("|".join(picked))
    df["neighbors"] = neighbor_ids

    export = df[
        [
            "passage_id",
            "chapter",
            "section",
            "subsection",
            "page",
            "text",
            "word_count",
            "cluster",
            "cluster_name",
            "x",
            "y",
            "neighbors",
        ]
    ]
    export.to_csv(MAP_PATH, index=False)

    matrix = (
        df.groupby(["section", "cluster_name"], as_index=False)
        .size()
        .rename(columns={"size": "count"})
    )
    matrix.to_csv(MATRIX_PATH, index=False)
    print(f"\nWrote {MAP_PATH}")
    print(f"Wrote {MATRIX_PATH}")


if __name__ == "__main__":
    main()
