"""Task 1–4: split the DKU undergraduate bulletin into passage units.

One paragraph or short policy block is one document. Chapter, section,
subsection, and page are kept so later views can compare where a passage
sits in the bulletin with what it means.
"""

import re
from pathlib import Path

import pandas as pd
import pymupdf

BASE_DIR = Path(__file__).resolve().parent.parent
PDF_PATH = BASE_DIR / "lab8" / "V2021-22_DKU_UG_Bulletin.pdf"
OUT_PATH = BASE_DIR / "data" / "bulletin_passages.csv"

# Printed page 10 is the first page of Part 1. Earlier pages are cover and TOC.
CONTENT_START_PAGE = 10
MIN_WORDS = 8


def normalize(text):
    text = text.lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def extract_lines(doc):
    lines = []
    for index, page in enumerate(doc):
        page_no = index + 1
        if page_no < CONTENT_START_PAGE:
            continue
        for block in page.get_text("dict")["blocks"]:
            if block.get("type") != 0:
                continue
            for line in block["lines"]:
                spans = line["spans"]
                text = "".join(span["text"] for span in spans).strip()
                if not text or line["bbox"][1] > 720:
                    continue
                if text.isdigit():
                    continue
                flags = spans[0]["flags"]
                lines.append(
                    {
                        "page": page_no,
                        "y": line["bbox"][1],
                        "size": spans[0]["size"],
                        "bold": bool(flags & 16),
                        "italic": bool(flags & 2),
                        "text": text,
                    }
                )
    return lines


def group_blocks(lines):
    blocks = []
    current = None
    for line in lines:
        if current is None:
            current = {**line, "parts": [line["text"]]}
            continue
        same_style = (
            abs(line["size"] - current["size"]) < 0.6
            and line["bold"] == current["bold"]
            and line["italic"] == current["italic"]
        )
        # Body lines sit ~15pt apart; wrapped headings ~18pt; new paragraphs ~27pt.
        gap = line["y"] - current["y"] if line["page"] == current["page"] else 999
        if line["page"] == current["page"] and same_style and gap <= 24:
            joiner = "" if current["parts"][-1].endswith("-") else " "
            if joiner == "":
                current["parts"][-1] = current["parts"][-1][:-1]
            current["parts"].append(line["text"])
            current["y"] = line["y"]
            continue
        current["text"] = assemble(current["parts"])
        blocks.append(current)
        current = {**line, "parts": [line["text"]]}
    if current is not None:
        current["text"] = assemble(current["parts"])
        blocks.append(current)
    return blocks


def assemble(parts):
    text = ""
    for part in parts:
        if text.endswith("-"):
            text = text[:-1] + part
        elif text:
            text += " " + part
        else:
            text = part
    return re.sub(r"\s+", " ", text).strip()


def match_toc(text, page, toc, cursor):
    key = normalize(text)
    if len(key) < 6:
        return None
    start = max(0, cursor - 1)
    stop = min(len(toc), cursor + 15)
    for index in range(start, stop):
        if abs(toc[index]["page"] - page) > 2:
            continue
        title = toc[index]["key"]
        if key == title or title.startswith(key):
            return index
        if key.startswith(title) and len(title) >= 24:
            return index
    return None


def is_heading(block):
    if block["italic"]:
        return False
    if block["bold"] or block["size"] >= 13.5:
        return True
    words = block["text"].split()
    # Size-12 labels such as "Academic Warning" are headings even when not bold.
    return (
        block["size"] >= 11.8
        and len(words) <= 14
        and not re.search(r"[.!?]$", block["text"])
    )


def build_passages(blocks, toc):
    chapter = section = subsection = ""
    cursor = 0
    passages = []
    pending = None

    def flush():
        nonlocal pending
        if pending and pending["text"]:
            passages.append(pending)
        pending = None

    for block in blocks:
        if is_heading(block):
            flush()
            hit = match_toc(block["text"], block["page"], toc, cursor)
            if hit is not None:
                cursor = hit + 1
                level = toc[hit]["level"]
                title = toc[hit]["title"]
                if level == 1:
                    chapter, section, subsection = title, "", ""
                elif level == 2:
                    section, subsection = title, ""
                else:
                    subsection = title
            elif block["text"].startswith("Part "):
                chapter, section, subsection = block["text"], "", ""
            elif block["size"] >= 13.5:
                section, subsection = block["text"], ""
            else:
                subsection = block["text"]
            continue

        text = block["text"]
        continues = (
            pending is not None
            and pending["page"] + 1 >= block["page"]
            and not re.search(r"[.!?…][\"')\]]*$", pending["text"])
            and text[:1].islower()
        )
        if continues:
            pending["text"] = assemble([pending["text"], text])
            continue

        flush()
        pending = {
            "chapter": chapter or "Front matter",
            "section": section or chapter or "Front matter",
            "subsection": subsection,
            "page": block["page"],
            "text": text,
        }
    flush()
    return passages


def main():
    doc = pymupdf.open(PDF_PATH)
    toc = [
        {"level": level, "title": title.strip(), "key": normalize(title), "page": page}
        for level, title, page in doc.get_toc()
    ]
    lines = extract_lines(doc)
    blocks = group_blocks(lines)
    raw = build_passages(blocks, toc)
    print(f"Raw passages: {len(raw)}")

    df = pd.DataFrame(raw)
    df = df.dropna(subset=["text"])
    df["text"] = df["text"].str.replace(r"\s+", " ", regex=True).str.strip()
    df = df[df["text"].str.len() > 0]
    df = df.drop_duplicates(subset=["text"])

    df["text_clean"] = df["text"].str.replace(r"\s+", " ", regex=True).str.strip()
    df["word_count"] = df["text_clean"].str.split().str.len()
    before = len(df)
    df = df[df["word_count"] >= MIN_WORDS].copy()
    df = df[~df["text_clean"].str.startswith("--")].copy()
    df["subsection"] = df["subsection"].fillna("")
    print(f"After dropping fragments under {MIN_WORDS} words: {len(df)} (from {before})")

    df.insert(0, "passage_id", [f"p{i:05d}" for i in range(1, len(df) + 1)])
    df = df[
        ["passage_id", "chapter", "section", "subsection", "page", "text", "text_clean", "word_count"]
    ]
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT_PATH, index=False)

    print("\nPassage length")
    print(df["word_count"].describe().to_string())
    print("\nPassages by chapter")
    print(df["chapter"].value_counts().to_string())
    print("\nPassages by section (top 25)")
    print(df["section"].value_counts().head(25).to_string())
    print(f"\nFormal sections: {df['section'].nunique()}")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
