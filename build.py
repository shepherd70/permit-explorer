#!/usr/bin/env python3
"""Build the permit-explorer dashboard.

Reads the newest CSV in data/raw/, cleans it, and injects it into
src/template.html to produce a fully self-contained dist/permit_dashboard.html.

Usage:
    python build.py [path/to/permits.csv]

Requires: pandas (pip install pandas)
"""
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent
TEMPLATE = ROOT / "src" / "template.html"
OUT = ROOT / "dist" / "permit_dashboard.html"


def find_csv() -> Path:
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    csvs = sorted((ROOT / "data" / "raw").glob("*.csv"), key=lambda p: p.stat().st_mtime)
    if not csvs:
        sys.exit("No CSV found in data/raw/ and none given on the command line.")
    return csvs[-1]


# Columns referenced below — read only these instead of the whole CSV.
USECOLS = [
    "PermitNum", "StatusCurrent", "AppliedDate", "IssuedDate", "CompletedDate",
    "PermitType", "PermitClassGroup", "PermitClass", "WorkClass", "Description",
    "ContractorName", "HousingUnits", "EstProjectCost", "TotalSqFt",
    "OriginalAddress", "CommunityName", "Latitude", "Longitude",
]

# text fields -> the source column to clean()
_TEXT_COLS = {
    "status": "StatusCurrent", "type": "PermitType", "cls": "PermitClassGroup",
    "clsDetail": "PermitClass", "work": "WorkClass", "desc": "Description",
    "contractor": "ContractorName", "addr": "OriginalAddress",
    "community": "CommunityName",
}
_DATE_COLS = {"applied": "AppliedDate", "issued": "IssuedDate", "completed": "CompletedDate"}


def clean_col(s: pd.Series) -> pd.Series:
    """Vectorized equivalent of the old per-cell clean(): collapse internal
    whitespace and strip, mapping missing values to None."""
    cleaned = s.astype(str).str.replace(r"\s+", " ", regex=True).str.strip()
    return cleaned.where(s.notna(), None)


def load(src: Path) -> list[dict]:
    df = pd.read_csv(src, usecols=USECOLS)
    df["cost"] = pd.to_numeric(df["EstProjectCost"].str.replace(r"[\$,]", "", regex=True), errors="coerce")
    df["sqft"] = pd.to_numeric(df["TotalSqFt"], errors="coerce")
    df["units"] = pd.to_numeric(df["HousingUnits"], errors="coerce").fillna(0).astype(int)
    for c in ["AppliedDate", "IssuedDate", "CompletedDate"]:
        df[c] = pd.to_datetime(df[c], errors="coerce")

    df["daysToIssue"] = (df["IssuedDate"] - df["AppliedDate"]).dt.days
    df["daysToComplete"] = (df["CompletedDate"] - df["IssuedDate"]).dt.days
    df.loc[df["daysToIssue"] < 0, "daysToIssue"] = None
    df.loc[df["daysToComplete"] < 0, "daysToComplete"] = None

    # Do the per-cell work the old iterrows loop did — clean() on every text
    # column, strftime() on every date — once per column (vectorized), then
    # assemble records from native-Python column lists. No per-row Series.
    text = {k: clean_col(df[col]).tolist() for k, col in _TEXT_COLS.items()}
    dates = {k: df[col].dt.strftime("%Y-%m-%d").where(df[col].notna(), None).tolist()
             for k, col in _DATE_COLS.items()}
    pid = df["PermitNum"].tolist()
    units = df["units"].tolist()
    cost = df["cost"].tolist()
    sqft = df["sqft"].tolist()
    lat = df["Latitude"].tolist()
    lng = df["Longitude"].tolist()
    dti = df["daysToIssue"].tolist()
    dtc = df["daysToComplete"].tolist()

    rows = []
    for i in range(len(df)):
        rows.append({
            "id": pid[i],
            "status": text["status"][i],
            "applied": dates["applied"][i],
            "issued": dates["issued"][i],
            "completed": dates["completed"][i],
            "type": text["type"][i],
            "cls": text["cls"][i] or "Unspecified",
            "clsDetail": text["clsDetail"][i],
            "work": text["work"][i] or "Unspecified",
            "desc": text["desc"][i],
            "contractor": text["contractor"][i],
            "units": int(units[i]),
            "cost": None if pd.isna(cost[i]) else round(float(cost[i])),
            "sqft": None if pd.isna(sqft[i]) else round(float(sqft[i])),
            "addr": text["addr"][i],
            "community": text["community"][i],
            "lat": round(float(lat[i]), 6) if pd.notna(lat[i]) else None,
            "lng": round(float(lng[i]), 6) if pd.notna(lng[i]) else None,
            "dti": None if pd.isna(dti[i]) else int(dti[i]),
            "dtc": None if pd.isna(dtc[i]) else int(dtc[i]),
        })
    return rows


def main():
    src = find_csv()
    rows = load(src)
    data = json.dumps(rows, separators=(",", ":")).replace("</", "<\\/")
    tpl = TEMPLATE.read_text(encoding="utf-8")
    assert "__DATA__" in tpl, "template missing __DATA__ placeholder"
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(tpl.replace("__DATA__", data), encoding="utf-8")
    print(f"Built {OUT} ({OUT.stat().st_size:,} bytes) from {src.name} ({len(rows):,} permits)")


if __name__ == "__main__":
    main()
