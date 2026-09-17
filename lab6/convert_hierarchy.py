"""
Lab 6 — Assignment Part A
Convert a flat GDP CSV into a hierarchical JSON file for D3.

Hierarchy : World -> Continent -> Area -> Country
Leaf data : gdp (numeric), status (categorical)

Paths are resolved relative to THIS script, so the script can be
run from any working directory.
"""

import os
import json
import pandas as pd


# ---- Paths resolved relative to this script's location ----
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR   = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "data"))
INPUT_CSV  = os.path.join(DATA_DIR, "lab6_assignment_gdp.csv")
OUTPUT_JSON = os.path.join(DATA_DIR, "lab6_assignment_gdp.json")


def build_hierarchy(dataframe, levels, value_column, status_column):
    """
    Recursively build a nested dictionary hierarchy.

    Parameters
    ----------
    dataframe     : pd.DataFrame (a subset at the current level)
    levels        : list of column names from top to leaf,
                    e.g. ["continent", "area", "country"]
    value_column  : numeric column used for treemap area
    status_column : categorical column used for leaf color
    """
    # ----- Base case: leaf level (country) -----
    if len(levels) == 1:
        return [
            {
                "name":   row[levels[0]],
                "gdp":    int(row[value_column]),
                "status": row[status_column],
            }
            for _, row in dataframe.iterrows()
        ]

    # ----- Recursive case -----
    current_level = levels[0]
    children = []

    for value, group in dataframe.groupby(current_level, sort=True):
        children.append({
            "name": value,
            "children": build_hierarchy(
                group,
                levels[1:],
                value_column,
                status_column,
            ),
        })

    return children


def main():
    # ---- 0. Sanity check: does the input file exist? ----
    print(f"Looking for input CSV at:\n  {INPUT_CSV}")
    if not os.path.exists(INPUT_CSV):
        raise FileNotFoundError(
            f"\nCould not find the input CSV:\n  {INPUT_CSV}\n"
            f"Make sure the file 'lab6_assignment_gdp.csv' is inside:\n"
            f"  {DATA_DIR}"
        )

    # ---- 1. Load flat CSV ------------------------------------------
    df = pd.read_csv(INPUT_CSV)

    # ---- 2. Build the hierarchy ------------------------------------
    hierarchy = {
        "name": "World",
        "children": build_hierarchy(
            df,
            levels=["continent", "area", "country"],
            value_column="gdp_billion_usd",
            status_column="gdp_status",
        ),
    }

    # ---- 3. Save JSON ----------------------------------------------
    os.makedirs(DATA_DIR, exist_ok=True)

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(hierarchy, f, indent=2, ensure_ascii=False)

    # ---- 4. Summary -------------------------------------------------
    print(f"Wrote {OUTPUT_JSON}")
    print("Continents:", [c["name"] for c in hierarchy["children"]])


if __name__ == "__main__":
    main()