#!/usr/bin/env python3
"""
M0 data-validation v2 for the Calgary development-watch app.

Changes vs v1 (after the first run):
  * A 403 on /api/views no longer kills the dataset -- we always probe the
    /resource data endpoint, and fall back to max(:updated_at) for freshness
    when metadata is blocked.
  * Tests the alternative high-volume DP backbones (6933-unw5, gmmz-2tuv) in
    the same run, so we confirm which "what's-proposed-near-me" feed is live
    even if 4ggt-z6xp stays restricted.
  * Judges the comment/appeal feed (public notices) by OBJECT freshness +
    OPEN WINDOWS (dp_ad_end_dt >= today), not new-rows-in-30-days, and prints
    recent rows so the field semantics are visible.

Set SOCRATA_APP_TOKEN (free: data.calgary.ca -> Sign In -> Developer Settings)
before running -- anonymous access is rate limited and may 403. Stdlib only.

    python m0_validate.py            # all candidates
    python m0_validate.py 4ggt-z6xp  # one dataset
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE = "https://data.calgary.ca"

# role: "browse" = high-volume map/firehose feed; "notice" = comment/appeal feed
DATASETS = [
    ("4ggt-z6xp", "Development Permit Application Locations", "browse"),
    ("6933-unw5", "Development Permits", "browse"),
    ("gmmz-2tuv", "Development Permit Applications", "browse"),
    ("8rd9-gix2", "Development Permit Public Notices", "notice"),
]

FRESH_DAYS, CAUTION_DAYS = 2, 8
APP_TOKEN = os.environ.get("SOCRATA_APP_TOKEN", "").strip()
NOW = datetime.now(timezone.utc)
TODAY_ISO = NOW.strftime("%Y-%m-%dT00:00:00")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "dp-m0/2.0"})
    if APP_TOKEN:
        req.add_header("X-App-Token", APP_TOKEN)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8")), None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}"
    except Exception as e:
        return None, str(e)


def soda(dsid, params):
    qs = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
    return get(f"{BASE}/resource/{dsid}.json" + (f"?{qs}" if qs else ""))


def parse_dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "")[:19]) \
            .replace(tzinfo=timezone.utc)
    except Exception:
        return None


def age_days(dt):
    return None if dt is None else (NOW - dt).total_seconds() / 86400.0


def band(d):
    if d is None:
        return "UNKNOWN"
    return "FRESH" if d <= FRESH_DAYS else "CAUTION" if d <= CAUTION_DAYS else "STALE"


def detect_geometry(sample):
    for k, v in sample.items():
        if k in ("point", "location", "the_geom", "geom"):
            return k
        if isinstance(v, dict) and "coordinates" in v:
            return k
    return None


def first_val(rows):
    return list(rows[0].values())[0] if rows else None


def validate(dsid, label, role):
    print("=" * 64)
    print(f"{label} ({dsid})  [{role}]")
    print("=" * 64)

    # object freshness from metadata if reachable (often 403 on spatial views)
    meta, merr = get(f"{BASE}/api/views/{dsid}.json")
    obj_age = None
    if meta and meta.get("rowsUpdatedAt"):
        dt = datetime.fromtimestamp(int(meta["rowsUpdatedAt"]), tz=timezone.utc)
        obj_age = age_days(dt)
        print(f"  metadata          : OK  (rows updated {dt:%Y-%m-%d %H:%M}Z, "
              f"{obj_age:.1f}d ago)")
    else:
        print(f"  metadata          : {merr}  -> using data-endpoint fallback")

    # data endpoint -- the real test
    sample, serr = soda(dsid, {"$limit": 1})
    if serr or not sample:
        print(f"  data endpoint     : UNREACHABLE ({serr})")
        print("  --> VERDICT: NO-GO for this dataset\n")
        return
    row = sample[0]
    geo = detect_geometry(row)
    print("  data endpoint     : OK")
    print(f"  columns ({len(row)}): {', '.join(list(row)[:12])}"
          f"{' ...' if len(row) > 12 else ''}")
    print(f"  geometry          : {geo or '(none detected)'}")

    # freshness via system field (works even when /api/views is blocked)
    upd, _ = soda(dsid, {"$select": "max(:updated_at)"})
    upd_age = age_days(parse_dt(first_val(upd)))
    if upd_age is not None:
        print(f"  last row update   : {upd_age:.1f}d ago  [{band(upd_age)}]")
    fresh_age = min([a for a in (obj_age, upd_age) if a is not None], default=None)

    # count
    cnt, _ = soda(dsid, {"$select": "count(*)"})
    n = int(cnt[0]["count"]) if cnt else None
    print("  total rows        : " + (f"{n:,}" if n is not None else "?"))

    if role == "notice" and "dp_ad_end_dt" in row:
        # comment/appeal feed: judge by open windows, not daily volume
        openc, _ = soda(dsid, {"$select": "count(*)",
                               "$where": f"dp_ad_end_dt >= '{TODAY_ISO}'"})
        n_open = int(openc[0]["count"]) if openc else None
        print(f"  OPEN windows now  : {n_open}  (dp_ad_end_dt >= today)")
        recent, _ = soda(dsid, {
            "$select": "xtrnl_file_no,posse_addr,com_nm,lud_cd,dp_ad_dt,"
                       "dp_ad_end_dt,job_dscrn",
            "$order": "dp_ad_dt DESC", "$limit": 6})
        print("  most recent notices:")
        for r in (recent or []):
            print(f"    {str(r.get('dp_ad_dt','?'))[:10]} -> "
                  f"{str(r.get('dp_ad_end_dt','?'))[:10]}  "
                  f"{str(r.get('com_nm','?')):<18} {str(r.get('lud_cd','?')):<8} "
                  f"{r.get('xtrnl_file_no','?')}  "
                  f"{(r.get('job_dscrn','') or '')[:40]}")
        if band(fresh_age) != "STALE" and (n_open or 0) > 0:
            verdict = "GO (object fresh + open windows -> the actionable alert feed)"
        elif band(fresh_age) != "STALE":
            verdict = ("CAUTION (maintained but no windows open right now -- "
                       "episodic by nature; watch for new postings)")
        else:
            verdict = "NO-GO (export appears to be lagging)"
    else:
        # browse feed: needs volume + a recent newest record
        date_field = next((f for f in row
                           if any(k in f.lower() for k in
                                  ("appl", "intake", "submit", "issue", "date"))), None)
        d_age = None
        if date_field:
            mx, _ = soda(dsid, {"$select": f"max({date_field})"})
            d_age = age_days(parse_dt(first_val(mx)))
            print(f"  newest ({date_field}): "
                  + (f"{d_age:.1f}d ago  [{band(d_age)}]" if d_age is not None else "?"))
        big = (n or 0) > 1000
        if big and band(d_age) == "FRESH":
            verdict = "GO (large + current -> the browse/map backbone)"
        elif big and band(d_age) == "CAUTION":
            verdict = "CAUTION (current-ish -> weekly digest rather than instant)"
        elif big:
            verdict = "CAUTION (large but newest record is old -- confirm cadence)"
        else:
            verdict = "NO-GO (too few rows to be the firehose)"

    print(f"  --> VERDICT: {verdict}\n")


def main():
    if not APP_TOKEN:
        print("WARNING: no SOCRATA_APP_TOKEN set -- expect rate-limit 403s. "
              "Set one and re-run.\n")
    targets = [d for d in DATASETS if d[0] in sys.argv[1:]] \
        if len(sys.argv) > 1 else DATASETS
    for dsid, label, role in targets:
        validate(dsid, label, role)
    print("Pick the best 'browse' GO as the map backbone; the 'notice' feed "
          "drives the high-signal comment/appeal alerts.")


if __name__ == "__main__":
    main()