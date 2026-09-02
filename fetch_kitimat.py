#!/usr/bin/env python3
"""Build the Kitimat permit snapshot (data/kitimat/) from its three public sources.

The Kitimat explorer (src/kitimat_explorer.html) cannot query its sources live:
neither the District's Cloudpermit public-records endpoint nor the District's
ArcGIS Server sends CORS headers, and the Cloudpermit endpoint is an internal
one with no published contract. So this script runs at refresh time (a weekly
GitHub Actions job, or by hand) and writes a small, deterministic snapshot that
build.py embeds into the page:

  data/kitimat/snapshot.json   permits + BC Stats series + neighbourhood polygons
  data/kitimat/meta.json       fetch timestamp, source URLs, counts (changes every run)

Sources (all verified 2026-09-02; see docs/kitimat-scope.md):
  1. Cloudpermit public records — issued building permits since Dec 2025
     POST https://ca.cloudpermit.com/api/command/public-records/search-applications
  2. BC Stats "Building Permits (BPER)" — monthly value / units for census
     subdivision 5949005 (Kitimat), Jan 2018 →. Open Government Licence – BC.
  3. District of Kitimat ArcGIS Server — neighbourhood polygons and parcels
     (OCP zone by PID).

Standard library only. Usage:
    python3 fetch_kitimat.py            # full refresh → data/kitimat/
    python3 fetch_kitimat.py --check    # contract smoke test only (no files written)
    python3 fetch_kitimat.py --skip-geo # reuse committed neighbourhood polygons
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
OUT_DIR = ROOT / "data" / "kitimat"
SNAPSHOT = OUT_DIR / "snapshot.json"
META = OUT_DIR / "meta.json"

USER_AGENT = "permit-explorer/1.0 (+https://github.com/shepherd70/permit-explorer; weekly snapshot)"

# --- source 1: Cloudpermit public records -------------------------------------
CLOUDPERMIT_URL = "https://ca.cloudpermit.com/api/command/public-records/search-applications"
CLOUDPERMIT_PUBLIC_PAGE = "https://ca.cloudpermit.com/kitimat/public-records"
DOMAIN_GROUP_ID = "CA-5949005"          # District of Kitimat = SGC 5949005
PAGE_SIZE = 500
# Every row the public list returns carries these keys (contract asserted by --check).
CLOUDPERMIT_FIELDS = (
    "workspace/municipal-case-id", "address/full-address", "category-names",
    "created", "issued-date", "location", "property/id", "id",
)

# --- source 2: BC Stats BPER (BC Data Catalogue, CKAN resource downloads) ------
BPER_DATASET = "https://catalogue.data.gov.bc.ca/dataset/building-permits-bper-"
_BPER_RES = "https://catalogue.data.gov.bc.ca/dataset/45a00be0-d572-4e42-be18-1bbaaf6c85ee/resource/{}/download/{}"
BPER_SERIES = {
    # key: (resource id, file name, kind)   kind: "value" ($000 in the file) | "units"
    "total":            ("1e1faf36-6526-4f7c-8586-a01f3b2a56a5", "total.csv", "value"),
    "residential":      ("920f54ae-652d-4643-80cf-423affd5b0d1", "residential.csv", "value"),
    "industrial":       ("9089793a-8985-40eb-99fe-09d6aae5bb4b", "industrial.csv", "value"),
    "commercial":       ("6174ab63-8034-499d-b041-f0d9a3b75deb", "commercial.csv", "value"),
    "instigov":         ("9a7b3388-99d6-4f51-a4b6-88ec645db9cd", "instigov.csv", "value"),
    "units_total":      ("dbc42bcc-75b3-4d48-a8b9-aefdd2608e63", "resunitstotal.csv", "units"),
    "units_single":     ("88b6aea2-7caa-4f68-921f-9c7062da65fd", "resunitssingle.csv", "units"),
    "units_row":        ("d4f4740f-39ea-4551-b8df-c07cead40291", "resunitsrow.csv", "units"),
    "units_apartment":  ("edbe5846-cdc1-4454-9734-b034d3ec046c", "resunitsapartment.csv", "units"),
}
BPER_SGC = "5949005"
BPER_HEADER_PREFIX = "Standard Geographical Classification"
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

# --- source 3: District of Kitimat ArcGIS Server --------------------------------
ARCGIS = "https://map.kitimat.ca/server/rest/services"
NEIGHBOURHOODS_LAYER = f"{ARCGIS}/Neighbourhoods/MapServer/10"
PARCELS_LAYER = f"{ARCGIS}/Legal_Information/MapServer/31"
EXPECTED_NEIGHBOURHOODS = 8
OUTSIDE_LABEL = "Outside neighbourhoods"
SIMPLIFY_TOLERANCE_DEG = 0.00005     # ≈ 5 m; 278 KB full-resolution → tens of KB
COORD_DECIMALS = 5                   # ≈ 1 m


# ==============================================================================
# HTTP (tiny, retrying)
# ==============================================================================
def _request(url: str, data: bytes | None = None, headers: dict | None = None, attempts: int = 3) -> bytes:
    hdrs = {"User-Agent": USER_AGENT}
    hdrs.update(headers or {})
    last: Exception | None = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, data=data, headers=hdrs, method="POST" if data is not None else "GET")
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as e:  # pragma: no cover - network
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"request failed after {attempts} attempts: {url}: {last}")


def get_json(url: str) -> dict:
    return json.loads(_request(url, headers={"Accept": "application/json"}).decode("utf-8"))


def post_json(url: str, body: dict) -> dict:
    raw = _request(url, data=json.dumps(body).encode("utf-8"),
                   headers={"Content-Type": "application/json", "Accept": "application/json"})
    return json.loads(raw.decode("utf-8"))


def get_text(url: str) -> str:
    return _request(url).decode("utf-8-sig")


# ==============================================================================
# Source 1 — Cloudpermit
# ==============================================================================
def cloudpermit_query(skip: int = 0, limit: int = PAGE_SIZE) -> dict:
    return post_json(CLOUDPERMIT_URL, {
        "domain-group-id": DOMAIN_GROUP_ID, "skip": skip, "limit": limit,
        "sort-condition": ["workspace/municipal-case-id", "asc"],
    })


def fetch_cloudpermit_rows() -> list[dict]:
    """All public rows, paginated until `total-count` is satisfied."""
    rows: list[dict] = []
    total = None
    while total is None or len(rows) < total:
        page = cloudpermit_query(skip=len(rows))
        total = int(page["total-count"])
        got = page.get("results") or []
        if not got:
            break
        rows.extend(got)
    if total is not None and len(rows) != total:
        raise RuntimeError(f"Cloudpermit pagination mismatch: got {len(rows)} rows, total-count {total}")
    return rows


def _local_date(iso: str | None) -> str | None:
    """UTC timestamp → calendar date in Kitimat (America/Vancouver); UTC date if tz data is unavailable."""
    if not iso:
        return None
    t = dt.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    try:
        from zoneinfo import ZoneInfo
        t = t.astimezone(ZoneInfo("America/Vancouver"))
    except Exception:  # pragma: no cover - missing tzdata
        pass
    return t.date().isoformat()


def permit_sort_key(permit_no: str) -> tuple:
    """BLDG-2026-9 sorts before BLDG-2026-10 (natural order on the year and sequence)."""
    parts = permit_no.split("-")
    nums = tuple(int(p) if p.isdigit() else 0 for p in parts[1:])
    return (parts[0], nums, permit_no)


def normalise_permit(row: dict) -> dict:
    cats = row.get("category-names") or []
    category = next((c.get("localized-string/text") for c in cats if c.get("localized-string/text")), None)
    loc = row.get("location") or {}
    coords = loc.get("coordinates") if loc.get("type") == "Point" else None
    created = _local_date(row.get("created"))
    issued = _local_date(row.get("issued-date"))
    days = None
    if created and issued:
        days = (dt.date.fromisoformat(issued) - dt.date.fromisoformat(created)).days
    return {
        "permit": row.get("workspace/municipal-case-id"),
        "id": row.get("id"),
        "address": (row.get("address/full-address") or "").strip() or None,
        "category": category or "Uncategorized",
        "created": created,
        "issued": issued,
        "days": days,                         # issued − created; the page excludes negatives like the Calgary explorer
        "lon": round(float(coords[0]), 6) if coords else None,
        "lat": round(float(coords[1]), 6) if coords else None,
        "pid": row.get("property/id"),
        "state": (row.get("domain/state") or "").split("/")[-1] or None,
    }


# ==============================================================================
# Source 2 — BC Stats BPER
# ==============================================================================
def _month_key(label: str) -> str | None:
    """'Jan 2018' → '2018-01'; anything else → None."""
    parts = label.strip().split()
    if len(parts) == 2 and parts[0] in MONTHS and parts[1].isdigit() and len(parts[1]) == 4:
        return f"{parts[1]}-{MONTHS.index(parts[0]) + 1:02d}"
    return None


def parse_bper_csv(text: str, sgc: str = BPER_SGC, kind: str = "value") -> list[dict]:
    """One BC Stats wide CSV → [{m:'2018-01', v:<number|null>, x:<bool suppressed>}] for one SGC row.

    The file is a matrix: a title row, a units row, then a header row whose first
    cell starts with 'Standard Geographical Classification' followed by one
    column per month. Values are formatted with thousands separators; 'x' marks a
    suppressed cell; trailing months can be blank. Value files are in $000 and are
    returned in dollars; unit files are returned as counts.
    """
    rows = list(csv.reader(io.StringIO(text)))
    header_idx = next((i for i, r in enumerate(rows) if r and r[0].strip().startswith(BPER_HEADER_PREFIX)), None)
    if header_idx is None:
        raise ValueError("BPER header row not found")
    header = rows[header_idx]
    months = [(i, _month_key(h)) for i, h in enumerate(header)]
    months = [(i, m) for i, m in months if m]
    if not months:
        raise ValueError("BPER header has no month columns")
    target = next((r for r in rows[header_idx + 1:] if r and r[0].strip() == sgc), None)
    if target is None:
        raise ValueError(f"BPER row for SGC {sgc} not found")
    out = []
    scale = 1000 if kind == "value" else 1
    for i, m in months:
        cell = target[i].strip() if i < len(target) else ""
        if cell.lower() == "x":
            out.append({"m": m, "v": None, "x": True})
        elif cell == "" or cell in ("..", "...", "-"):
            out.append({"m": m, "v": None, "x": False})
        else:
            out.append({"m": m, "v": round(float(cell.replace(",", "")) * scale), "x": False})
    return out


def fetch_bper() -> dict:
    series = {}
    for key, (rid, fname, kind) in BPER_SERIES.items():
        series[key] = parse_bper_csv(get_text(_BPER_RES.format(rid, fname)), kind=kind)
    months = [p["m"] for p in series["total"]]
    return {
        "sgc": BPER_SGC, "name": "Kitimat", "first": months[0], "last": months[-1],
        "licence": "Open Government Licence - British Columbia", "source": BPER_DATASET,
        "series": series,
    }


# ==============================================================================
# Source 3 — ArcGIS: neighbourhoods and parcels
# ==============================================================================
def point_in_ring(pt: tuple[float, float], ring: list) -> bool:
    x, y = pt
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
        if (y1 > y) != (y2 > y):
            xi = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if xi > x:
                inside = not inside
    return inside


def point_in_geometry(pt: tuple[float, float], geom: dict) -> bool:
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    for poly in polys:
        if point_in_ring(pt, poly[0]) and not any(point_in_ring(pt, hole) for hole in poly[1:]):
            return True
    return False


def assign_neighbourhood(lon: float | None, lat: float | None, features: list[dict]) -> str:
    if lon is None or lat is None:
        return OUTSIDE_LABEL
    for f in features:
        if point_in_geometry((lon, lat), f["geometry"]):
            return f["properties"]["name"]
    return OUTSIDE_LABEL


def _perp_dist(p, a, b) -> float:
    (px, py), (ax, ay), (bx, by) = p, a, b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    cx, cy = ax + t * dx, ay + t * dy
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5


def simplify_ring(ring: list, tol: float) -> list:
    """Douglas–Peucker on a closed ring; always keeps ≥ 4 points and the closing vertex."""
    pts = [tuple(p[:2]) for p in ring]
    closed = len(pts) > 1 and pts[0] == pts[-1]
    if closed:
        pts = pts[:-1]
    if len(pts) < 4:
        return [list(p) for p in pts] + ([list(pts[0])] if pts else [])

    def dp(points):
        if len(points) < 3:
            return points
        a, b = points[0], points[-1]
        idx, dmax = 0, -1.0
        for i in range(1, len(points) - 1):
            d = _perp_dist(points[i], a, b)
            if d > dmax:
                idx, dmax = i, d
        if dmax > tol:
            return dp(points[:idx + 1])[:-1] + dp(points[idx:])
        return [a, b]

    # split at the farthest point from the first vertex so the ring's two halves are open polylines
    far = max(range(1, len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    out = dp(pts[:far + 1])[:-1] + dp(pts[far:] + [pts[0]])[:-1]
    if len(out) < 3:
        out = pts
    out = [[round(x, COORD_DECIMALS), round(y, COORD_DECIMALS)] for x, y in out]
    out.append(list(out[0]))
    return out


def simplify_geometry(geom: dict, tol: float = SIMPLIFY_TOLERANCE_DEG) -> dict:
    if geom["type"] == "Polygon":
        return {"type": "Polygon", "coordinates": [simplify_ring(r, tol) for r in geom["coordinates"]]}
    if geom["type"] == "MultiPolygon":
        return {"type": "MultiPolygon", "coordinates": [[simplify_ring(r, tol) for r in poly] for poly in geom["coordinates"]]}
    return geom


def fetch_neighbourhoods() -> dict:
    """The District's 8 neighbourhood polygons as a compact WGS84 GeoJSON FeatureCollection."""
    q = urllib.parse.urlencode({"where": "1=1", "outFields": "Name", "outSR": "4326", "f": "geojson"})
    fc = get_json(f"{NEIGHBOURHOODS_LAYER}/query?{q}")
    if fc.get("error"):
        raise RuntimeError(f"ArcGIS error: {fc['error']}")
    feats = []
    for f in fc.get("features", []):
        feats.append({"type": "Feature", "properties": {"name": f["properties"].get("Name")},
                      "geometry": simplify_geometry(f["geometry"])})
    feats.sort(key=lambda f: f["properties"]["name"] or "")
    return {"type": "FeatureCollection", "features": feats}


def fetch_parcel_zones(pids: list[str]) -> dict[str, str]:
    """PID → OCP zone from the Legal Land Parcels layer, in chunks (PID is a string field)."""
    zones: dict[str, str] = {}
    pids = sorted({p for p in pids if p})
    for i in range(0, len(pids), 100):
        chunk = pids[i:i + 100]
        where = "PID IN (" + ",".join("'" + p.replace("'", "") + "'" for p in chunk) + ")"
        q = urllib.parse.urlencode({"where": where, "outFields": "PID,OCP_Zone", "returnGeometry": "false", "f": "json"})
        res = get_json(f"{PARCELS_LAYER}/query?{q}")
        if res.get("error"):
            raise RuntimeError(f"ArcGIS parcel query error: {res['error']}")
        for f in res.get("features", []):
            a = f["attributes"]
            z = (a.get("OCP_Zone") or "").strip()
            if a.get("PID") and z and z.upper() != "N/A":
                zones[a["PID"]] = z
    return zones


# ==============================================================================
# Snapshot assembly
# ==============================================================================
def build_snapshot(cloudpermit_rows: list[dict], bper: dict, neighbourhoods: dict, zones: dict[str, str]) -> dict:
    permits = [normalise_permit(r) for r in cloudpermit_rows]
    feats = neighbourhoods["features"]
    for p in permits:
        p["neighbourhood"] = assign_neighbourhood(p["lon"], p["lat"], feats)
        p["zone"] = zones.get(p["pid"]) if p.get("pid") else None
    permits.sort(key=lambda p: permit_sort_key(p["permit"] or ""))
    return {
        "version": 1,
        "permits": permits,
        "neighbourhood_names": [f["properties"]["name"] for f in feats] + [OUTSIDE_LABEL],
        "neighbourhoods": neighbourhoods,
        "bper": bper,
    }


def write_json(path: pathlib.Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")


# ==============================================================================
# --check: contract smoke test (mirrors test/smoke.js for the Calgary page)
# ==============================================================================
def check() -> int:
    failures = 0

    def ok(name: str, cond: bool, got=None) -> None:
        nonlocal failures
        if cond:
            print("  PASS", name)
        else:
            failures += 1
            print("  FAIL", name, ("-> got: " + json.dumps(got, default=str)[:300]) if got is not None else "")

    print("Cloudpermit public records")
    page = cloudpermit_query(skip=0, limit=1)
    ok("total-count is a positive integer", isinstance(page.get("total-count"), int) and page["total-count"] > 0, page.get("total-count"))
    row = (page.get("results") or [{}])[0]
    for f in CLOUDPERMIT_FIELDS:
        ok(f"row has {f}", f in row, sorted(row.keys()))
    ok("location is a GeoJSON Point", (row.get("location") or {}).get("type") == "Point", row.get("location"))
    n = normalise_permit(row) if row else {}
    ok("normalised row has a permit number and dates", bool(n.get("permit")) and bool(n.get("created")) and bool(n.get("issued")), n)

    print("BC Stats BPER")
    text = get_text(_BPER_RES.format(*BPER_SERIES["total"][:2]))
    series = parse_bper_csv(text, kind="value")
    ok("Kitimat row parses with ≥ 96 months starting 2018-01", len(series) >= 96 and series[0]["m"] == "2018-01", (len(series), series[:1]))
    ok("some months carry values", any(p["v"] for p in series), series[:3])

    print("Kitimat ArcGIS Server")
    q = urllib.parse.urlencode({"where": "1=1", "returnCountOnly": "true", "f": "json"})
    cnt = get_json(f"{NEIGHBOURHOODS_LAYER}/query?{q}")
    ok(f"neighbourhood layer has {EXPECTED_NEIGHBOURHOODS} polygons", cnt.get("count") == EXPECTED_NEIGHBOURHOODS, cnt)
    meta = get_json(f"{PARCELS_LAYER}?f=json")
    names = {f["name"] for f in meta.get("fields", [])}
    ok("parcel layer exposes PID and OCP_Zone", {"PID", "OCP_Zone"} <= names, sorted(names))

    print(f"\n{'OK' if not failures else 'FAILED'}: {failures} failure(s)")
    return 1 if failures else 0


# ==============================================================================
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="contract smoke test only; write nothing")
    ap.add_argument("--skip-geo", action="store_true", help="reuse neighbourhood polygons from the existing snapshot")
    ap.add_argument("--out", type=pathlib.Path, default=OUT_DIR, help="output directory (default data/kitimat)")
    args = ap.parse_args(argv)

    if args.check:
        return check()

    snapshot_path = args.out / "snapshot.json"
    meta_path = args.out / "meta.json"

    print("fetching Cloudpermit public records …")
    rows = fetch_cloudpermit_rows()
    print(f"  {len(rows)} permits")

    print("fetching BC Stats BPER series …")
    bper = fetch_bper()
    print(f"  {len(bper['series'])} series, {bper['first']} → {bper['last']}")

    if args.skip_geo and snapshot_path.exists():
        print("reusing neighbourhood polygons from the existing snapshot")
        neighbourhoods = json.loads(snapshot_path.read_text(encoding="utf-8"))["neighbourhoods"]
    else:
        print("fetching neighbourhood polygons …")
        neighbourhoods = fetch_neighbourhoods()
    if len(neighbourhoods["features"]) != EXPECTED_NEIGHBOURHOODS:
        print(f"error: expected {EXPECTED_NEIGHBOURHOODS} neighbourhoods, got {len(neighbourhoods['features'])}", file=sys.stderr)
        return 1

    print("fetching parcel OCP zones …")
    zones = fetch_parcel_zones([r.get("property/id") for r in rows])
    print(f"  {len(zones)} parcels matched")

    snap = build_snapshot(rows, bper, neighbourhoods, zones)
    write_json(snapshot_path, snap)
    counts = {}
    for p in snap["permits"]:
        counts[p["neighbourhood"]] = counts.get(p["neighbourhood"], 0) + 1
    write_json(meta_path, {
        "fetched_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "permits": len(snap["permits"]),
        "permits_by_neighbourhood": dict(sorted(counts.items())),
        "bper_last_month": bper["last"],
        "sources": {
            "cloudpermit": CLOUDPERMIT_PUBLIC_PAGE,
            "bper": BPER_DATASET,
            "arcgis": ARCGIS,
        },
    })
    print(f"wrote {snapshot_path.relative_to(ROOT) if snapshot_path.is_relative_to(ROOT) else snapshot_path} "
          f"({snapshot_path.stat().st_size:,} bytes) and {meta_path.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
