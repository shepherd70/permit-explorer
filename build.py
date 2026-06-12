#!/usr/bin/env python3
"""Build the permit-explorer dashboard.

Reads the newest CSV in data/raw/, cleans it, and injects it into
src/template.html to produce a fully self-contained dist/permit_dashboard.html.

Usage:
    python build.py [path/to/permits.csv]

Requires: pandas (pip install pandas)
"""
import json
import re
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


def clean(s):
    if pd.isna(s):
        return None
    return re.sub(r"\s+", " ", str(s)).strip()


def load(src: Path) -> list[dict]:
    df = pd.read_csv(src)
    df["cost"] = pd.to_numeric(df["EstProjectCost"].str.replace(r"[\$,]", "", regex=True), errors="coerce")
    df["sqft"] = pd.to_numeric(df["TotalSqFt"], errors="coerce")
    df["units"] = pd.to_numeric(df["HousingUnits"], errors="coerce").fillna(0).astype(int)
    for c in ["AppliedDate", "IssuedDate", "CompletedDate"]:
        df[c] = pd.to_datetime(df[c], errors="coerce")

    df["daysToIssue"] = (df["IssuedDate"] - df["AppliedDate"]).dt.days
    df["daysToComplete"] = (df["CompletedDate"] - df["IssuedDate"]).dt.days
    df.loc[df["daysToIssue"] < 0, "daysToIssue"] = None
    df.loc[df["daysToComplete"] < 0, "daysToComplete"] = None

    rows = []
    for _, r in df.iterrows():
        rows.append({
            "id": r["PermitNum"],
            "status": clean(r["StatusCurrent"]),
            "applied": r["AppliedDate"].strftime("%Y-%m-%d") if pd.notna(r["AppliedDate"]) else None,
            "issued": r["IssuedDate"].strftime("%Y-%m-%d") if pd.notna(r["IssuedDate"]) else None,
            "completed": r["CompletedDate"].strftime("%Y-%m-%d") if pd.notna(r["CompletedDate"]) else None,
            "type": clean(r["PermitType"]),
            "cls": clean(r["PermitClassGroup"]) or "Unspecified",
            "clsDetail": clean(r["PermitClass"]),
            "work": clean(r["WorkClass"]) or "Unspecified",
            "desc": clean(r["Description"]),
            "contractor": clean(r["ContractorName"]),
            "units": int(r["units"]),
            "cost": None if pd.isna(r["cost"]) else round(float(r["cost"])),
            "sqft": None if pd.isna(r["sqft"]) else round(float(r["sqft"])),
            "addr": clean(r["OriginalAddress"]),
            "community": clean(r["CommunityName"]),
            "lat": round(float(r["Latitude"]), 6) if pd.notna(r["Latitude"]) else None,
            "lng": round(float(r["Longitude"]), 6) if pd.notna(r["Longitude"]) else None,
            "dti": None if pd.isna(r["daysToIssue"]) else int(r["daysToIssue"]),
            "dtc": None if pd.isna(r["daysToComplete"]) else int(r["daysToComplete"]),
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
