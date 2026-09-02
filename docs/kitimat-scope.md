# Kitimat edition — feature scope

**Status:** implemented 2026-09-02 on `session/2026-09-02-kitimat-edition` (Phases 1–3 of §8; `src/kitimat_explorer.html`, `fetch_kitimat.py`, `.github/workflows/kitimat-refresh.yml`). Tracker task #37. Phase 0 (asking the District for a historical export) remains open.
**Scoped:** 2026-09-02, every source claim below verified live that day
(endpoints called, files downloaded, counts computed).

The question: can a Kitimat, BC version of the explorer be built, and is the
data on the BC Data Catalogue ("opendata BC")? Short answer — the provincial
catalogue holds only a **monthly city-wide aggregate** for Kitimat. The
**permit-level** data lives in the District's Cloudpermit public-records page,
which started in December 2025 and exposes five attributes per permit. Together
with the District's public ArcGIS Server (neighbourhood polygons, parcels,
addresses) that is enough for a **small, honest companion page**, not a port of
the Calgary explorer. Everything Calgary gives us that Kitimat does not is
listed in §3.

## 1. What the BC Data Catalogue has (and has not)

Searched `catalogue.data.gov.bc.ca` (CKAN `package_search`) for *building
permit*, *building permits municipal*, *development permit*, *permits issued*.

| Dataset | Useful? | Why |
|---|---|---|
| **Building Permits (BPER)**, BC Stats | **Yes** | Monthly permit value and residential units by census subdivision, Jan 2018 → Jun 2026; Kitimat is row SGC `5949005`. Open Government Licence – BC. CORS `*`. Details in §2B. |
| Local Government Statistics — DCCs and Building Permit Information (Schedule 305), 2003–2008 | Marginal | Annual per-municipality XLS from ministry financial-reporting forms; stops in 2008; hosted on a legacy `cscd.gov.bc.ca` URL. Could seed a 2003–2008 annual bar, nothing more. |
| BC Assessment — Permits | **No** | Monthly province-wide permit extract, but *"restricted to internal BC Government named users and some B.C. Post Secondary institutions"* under an EULA. |
| Everything else | No | Forestry, mining, fisheries permits. |

There is no permit-level municipal dataset for **any** BC municipality on the
provincial catalogue; municipalities that publish permits (Vancouver, Surrey,
Kelowna, Squamish) do so on their own portals. Kitimat has no open-data portal,
and `kitimat.ca` is a JavaScript-only site (Simplicity CMS) that returns an
empty shell to any fetch — nothing there is scrapeable.

## 2. The sources (verified live 2026-09-02)

### 2A. Cloudpermit public records — permit-level, Dec 2025 →

The District moved building permits and inspections to Cloudpermit around
January 2026 and enabled the public-records view at
<https://ca.cloudpermit.com/kitimat/public-records>. The page is a
ClojureScript SPA; captured with headless Chromium, it calls one data endpoint,
which also accepts plain JSON with no authentication:

```
POST https://ca.cloudpermit.com/api/command/public-records/search-applications
Content-Type: application/json
{"domain-group-id":"CA-5949005","skip":0,"limit":500}
```

Accepted parameters (from the server's own validation error): `domain-group-id`
(required), `permit-types` (keywords; only `permit-type/B` exists for Kitimat —
`P`, `D`, `Z` return 0), `skip`, `limit` (no cap observed; 500 returned all
rows), `municipalities`, `categories` (integer ids listed in the response's
`available-filters`), `property-id`, `shape` (a GeoJSON geometry — server-side
spatial filter), `sort-condition` (`municipal-case-id` | `created` | `submitted`,
`asc` | `desc`).

| Fact | Value |
|---|---|
| Rows | **69** building permits (`total-count`), ids `BLDG-2025-2` → `BLDG-2026-103` |
| `created` range | 2025-12-08 → 2026-08-11 |
| `issued-date` range | 2025-12-15 → 2026-09-01; present on **all 69** — the public list shows issued permits only (`domain/state` = `permit-issued`), so there is no in-review pipeline to display |
| Fields per row | `workspace/municipal-case-id`, `address/full-address`, `category-names[].localized-string/text`, `created`, `issued-date`, `location` (GeoJSON Point, WGS84), `property/id` (BC 9-digit PID), `municipality/number`, `workspace/permit-type`, `domain/state`, `id` |
| Categories | Industrial building 29 · Residential building 27 · Demolition 8 · Commercial building 4 · Plumbing 1 |
| created → issued | median **16 days**, mean 24.7, max 163, min −1 (one back-dated legacy row) |
| Visible-attribute config | the District exposes only `municipal-case-id`, `category-names`, `issued-date` on the public map; there is **no cost, contractor, dwelling-unit, status-history, description or applicant field** and no per-record detail endpoint (`public-records/case` etc. return the SPA shell) |
| CORS | **none** — no `Access-Control-Allow-Origin` with an `Origin` header; the JSON preflight returns 400. A browser page on another origin cannot call it directly (§5). |
| Terms | Undocumented internal endpoint of Cloudpermit's front end; no published licence or rate limit. Treat as publicly displayed municipal records: attribute "District of Kitimat via Cloudpermit", keep to one request per build, identify ourselves in the User-Agent. |

### 2B. BC Stats Building Permits (BPER) — monthly aggregate, 2018 →

Catalogue record `building-permits-bper-` (BC Stats; Open Government Licence –
BC; also mirrored on open.canada.ca). Ten CSVs of one shape each — a wide
matrix, one row per SGC geography, one column per month — plus XLSX and a PDF
highlights report:

`total.csv`, `residential.csv`, `industrial.csv`, `commercial.csv`,
`instigov.csv` (values, $000s) and `resunitstotal.csv`, `resunitssingle.csv`,
`resunitsrow.csv`, `resunitsapartment.csv` (dwelling units). Resource URLs
resolve via CKAN `package_show?id=45a00be0-d572-4e42-be18-1bbaaf6c85ee`.

Header row is line 3 (`Standard Geographical Classification (SGC) 2021`, blank,
`Jan 2018`, …); Kitimat is the row whose first cell is `5949005` (match on the
code, not the name — `5949` is the regional district). Suppressed cells are the
literal `x`; the last months can be blank. The 2003–2017 workbook is a separate
file with a documented **methodology break** at Jan 2018 — do not splice it.

Kitimat, computed from `total.csv` / `resunitstotal.csv` (months reported /
suppressed in brackets):

| Year | Permit value | Res. units |
|---|---|---|
| 2018 | $38.1M (11/1) | 15 (11/1) |
| 2019 | $326.3M (12/0) | 29 (11/1) |
| 2020 | $101.5M (12/0) | 7 (10/2) |
| 2021 | $121.7M (12/0) | 60 (11/1) |
| 2022 | $31.7M (11/1) | 15 (9/3) |
| 2023 | $44.9M (11/1) | 73 (11/1) |
| 2024 | $29.7M (10/2) | 16 (9/3) |
| 2025 | $37.4M (9/3) | 10 (9/3) |
| 2026 (to Jun) | $25.2M (4/2) | 11 (3/3) |

Suppression is heavy for a town this size (10 of 102 months on total value,
more on units), so annual sums must be labelled "n of 12 months reported" and
never treated as complete. CORS `*`, so the page may fetch these live.

### 2C. District of Kitimat ArcGIS Server — boundaries, parcels, addresses

`https://map.kitimat.ca/server/rest/services/` (ArcGIS Server 11.4, also
answers as `kitimap.kitimat.ca`; backs the public KITIMAP viewer). Query
capability on every layer; `f=geojson` and `outSR=4326` work.

| Service / layer | Rows | Fields of interest |
|---|---|---|
| `Neighbourhoods/MapServer/10` | **8** polygons — Cable Car, Whitesail, Nechako, City Centre, Imatra Heights, Kildala, Service Centre, Highway | `Name`. Full-resolution GeoJSON is 278 KB; simplify to ~30 KB and commit |
| `Legal_Information/MapServer/31` Legal Land Parcels | 4,283 | `PID`, `PIN`, `OCP_Zone`, `RollNumber`, `Area_*` — **joins to Cloudpermit `property/id`** |
| `Addresses/MapServer/0` / `1` / `2` | 4,666 polygons / 3,885 points / 536 unit points | `FULL_ADDRE`, `CIVIC`, `PID`, `Postal_Code` — fallback geocoder |
| `Building/MapServer/23` Building Footprints | 6,593 | geometry only |
| `Boundary/MapServer/44` | 1 | municipal boundary |

No CORS header is returned even with an `Origin`, so these are build-time
inputs too. No item in the District's ArcGIS Online org is public, and nothing
on the server carries permit attributes.

Point-in-polygon of the 69 Cloudpermit points against the 8 neighbourhoods:
Whitesail 15 · Kildala 9 · Nechako 8 · City Centre 4 · Service Centre 2 ·
Cable Car 2 · Highway 2 · Imatra Heights 0 · **outside all neighbourhoods 27**.
The 27 are the industrial sites — 2200 Bish Creek FSR (LNG) and 176 Ocelot Rd
(industrial park) — so the map needs an explicit "Industrial lands (outside
neighbourhoods)" bucket rather than dropping them.

### 2D. Checked and ruled out

- **Council packages** — agenda PDFs are on `docs.kitimat.ca/docs/` and
  `kitimat-docs.simplicitycms.ca/docs/`; the 2026-02-17 and 2026-05-04 regular
  agendas (190 pages each) contain no building-permit report, only individual
  development variance permits.
- **Annual reports / Interim Housing Needs Report (Dec 2024)** — old
  `kitimat.ca/en/...` PDF URLs now 404 after the site migration. The housing
  report reportedly cites "an average of 25 residential building permits per
  year since 2006", which means the District holds a historical table (§7).
- **Statistics Canada 34-10-0066** — CMA/province level only; BPER is the
  CSD-level derivative.
- **Regional District of Kitimat-Stikine** — separate authority for the
  unincorporated fringe; out of scope. Haisla Nation lands likewise.

## 3. Concept mapping (Calgary → Kitimat)

| Calgary field / surface | Kitimat equivalent | Verdict |
|---|---|---|
| `communityname` (300+) | neighbourhood polygon (8) + "Industrial lands" | ✓ by point-in-polygon at build time |
| `permitclassgroup` | Cloudpermit category (5) | ✓ |
| `applieddate` | `created` (workspace creation, not a formal application date) | ✓ with caveat |
| `issueddate` | `issued-date` | ✓ |
| `estprojectcost` | none per permit; BPER value city-wide by month | ✗ per permit, ✓ as trend |
| `housingunits` | none per permit; BPER units city-wide by month | ✗ per permit, ✓ as trend |
| `contractorname` | none | ✗ |
| `statuscurrent` | all rows are `permit-issued` | ✗ (no completion rate) |
| `latitude`/`longitude` | `location` Point | ✓ |
| `originaladdress` | `address/full-address` | ✓ |
| parcel key | `property/id` = PID → parcel layer (`OCP_Zone`) | ✓ new: zone mix |
| Development permits dataset | none | ✗ (DP toggle, DP→BP pipeline, decision outcomes all gone) |
| 490K rows, 1979 → | 69 rows, Dec 2025 → | server-side aggregation mode never needed — always "detail view" |

Surfaces that survive: count KPI, days-to-issue KPI and distribution, category
mix, yearly/monthly volume (thin), permit-point map, neighbourhood choropleth
(count only), table, CSV export, URL state, insights (reduced). Surfaces that
die: every cost/units/contractor KPI and chart, completion rate, renovation
lifecycle, compare-communities (8 areas with n < 20 each), DP mode, pipeline.

## 4. Recommended shape: a separate page, not a dataset toggle

The `DATASETS` registry assumes a Socrata host with SoQL aggregation, six
KPIs, and community-level server rollups. Kitimat has none of that, and the
value of the page comes from combining **two** sources on different time
bases. Forcing it through the registry would add null-guards to every surface
for no gain. Recommend `src/kitimat_explorer.html`, sharing the design system
(tokens, Okabe-Ito palette, card/table CSS, harness pattern) but with its own
two-pane layout:

1. **Construction activity since 2018** (BPER) — annual bars of permit value by
   sector with a stacked residential/commercial/industrial/institutional split,
   monthly line, residential units by type; suppressed months drawn as gaps and
   an "n of 12 months" badge per year; a note on the 2019 spike (LNG Canada
   era) so the axis does not mislead.
2. **Permits issued since December 2025** (Cloudpermit + ArcGIS) — KPIs: count,
   median days created→issued, residential share; category mix; monthly
   volume; Leaflet map with points by category and a neighbourhood choropleth
   by count; OCP-zone mix from the parcel join; sortable table (permit no.,
   address, neighbourhood, category, created, issued, days); CSV export;
   shareable filters (neighbourhood, category, year).

Branding: "Kitimat" throughout, District of Kitimat and BC Stats attribution in
the footer, and an explicit "what this page cannot show" disclosure (no cost,
no contractor, no history before Dec 2025) in the how-it-works panel.

## 5. Architecture: the data path

The blocking constraint is CORS: Cloudpermit and the ArcGIS server cannot be
called from the browser. Two options:

**A. Build-time snapshot (recommended).** A stdlib-only `fetch_kitimat.py`
pulls the Cloudpermit rows, the BPER CSVs, and (once) the neighbourhood and
parcel layers; assigns each permit a neighbourhood by point-in-polygon and an
OCP zone by PID; writes `data/kitimat/permits.json` (< 30 KB) and
`data/kitimat/bper.json` (long format, nulls for `x`). `build.py` inlines both
into the page the way the offline dashboard embeds its CSV. Refresh cadence: a
weekly GitHub Actions cron that runs the fetcher and either (a) commits the
snapshot, or (b) calls a Cloudflare Pages Deploy Hook so the fetch happens
inside the Pages build and no data is committed. Prefer (b): no bot commits,
and a failed fetch keeps the last good deploy. Zero runtime dependencies, a
fully deterministic harness, and users are insulated from the undocumented
endpoint.

**B. Cloudflare Pages Function proxy** (`/api/kitimat/permits`) with edge
caching. Live data, but a server component, an unversioned dependency at
request time, and the first real backend in the project. Only worth it if the
District's permit volume or freshness needs justify it; it does not today.

Fetch BPER live in the browser as well? It has CORS `*`, but snapshotting it
too keeps one code path and one failure mode. Keep the live-fetch as a
build-time fallback check, not a runtime feature.

CSP: with option A the new page needs no `connect-src` beyond the CDN
allowlist already in `_headers`; the Deploy-Hook build fetches server-side.

## 6. Testing

- **Parsers** — BPER wide→long: header row detection, month parsing, `x` → null
  with a `suppressed` flag, row selection by SGC `5949005`, annual rollup with
  month counts. Cloudpermit: field extraction, ISO dates, category text, PID.
- **Point-in-polygon** — fixture of five permits with known neighbourhoods plus
  one Bish Creek FSR row that must land in the industrial bucket; assert the
  8-way count above (15/9/8/4/2/2/2/0 + 27) on the committed snapshot.
- **Contract smoke** (`test/smoke_kitimat.js`, run by the weekly cron before
  deploying): `search-applications` with `limit: 1` returns `total-count ≥ 69`
  and every field in §2A; Neighbourhoods layer count = 8; BPER `total.csv` has
  a `5949005` row whose header starts `Jan 2018`. A failed smoke skips the
  deploy hook and opens an issue.
- **Page harness** — extend the `test/harness.js` self-extraction pattern to
  the new file with the snapshot as the fetch stub; cross-check KPIs against a
  pandas computation as in task #4.

## 7. Risks and decisions

- **Undocumented endpoint.** Cloudpermit can rename or gate
  `search-applications` at any time. Option A confines the blast radius to the
  weekly job; the smoke test is the alarm. Keep request volume to one call per
  build with a descriptive User-Agent.
- **Licensing.** Cloudpermit public records carry no stated licence. They are
  municipal records the District chose to publish; attribute clearly and do not
  redistribute the raw snapshot beyond what the page embeds. BPER is OGL-BC.
  ArcGIS layers: no terms page found — attribute "District of Kitimat" and ask
  when contacting them (below).
- **The big upgrade is a phone call.** The District's Housing Needs Report
  quotes permit counts back to 2006, so a permit register exists. One request to
  the Building department (250-632-8900) or administration@kitimat.ca for a CSV
  export of issued permits since 2006 (number, address, type, value, date)
  would turn this from a companion page into a real explorer. Ask before
  building Phase 2.
- **Tiny n.** 69 rows, 5 categories, 8 areas. Hide medians below n = 5, hide
  seasonality until n ≥ 100, never show percentages without the count beside
  them. Charts must not imply trends from a nine-month window.
- **`created` ≠ applied.** It is when the Cloudpermit workspace was created;
  label the KPI "days from file creation to issue" and exclude negative lags
  as the Calgary code does.
- **Suppression.** BPER gaps must render as gaps, and annual totals as partial
  where months are missing; a naïve sum silently understates 2024–2026.
- **Industrial dominance.** 29 of 69 permits and most of the dollar value are
  LNG-related and sit outside every neighbourhood; the bucket in §2C and the
  2019 annotation keep the residential story legible.
- **Domain.** Sibling subdomain on `krevian.com` (e.g. `kitimat-permits`), its
  own canonical tag, sitemap entry and robots line — same pattern as the
  Calgary move.
- **Effort.** Roughly four sessions: fetcher + snapshot + smoke (1), page (2),
  harness + cron + deploy (1). Add one if the District export arrives.

## 8. Phasing

1. **Phase 0 — ask.** Email the District for a historical permit export and
   confirm they are happy to be attributed. Decide the subdomain. Half a
   session, and it can run in parallel with Phase 1.
2. **Phase 1 — data.** `fetch_kitimat.py`, committed simplified neighbourhood
   GeoJSON, `data/kitimat/*.json`, parser unit tests, contract smoke test.
3. **Phase 2 — page.** `src/kitimat_explorer.html` with the two panes in §4,
   built by `build.py` into `dist/kitimat/index.html` (or its own Pages
   project — decide with the subdomain).
4. **Phase 3 — operate.** Weekly cron → smoke → Deploy Hook; README section;
   TASKS entry closed.
5. **Phase 4 — conditional.** If the District export arrives, add the
   historical register (cost, units, type by year, renovation lifecycle become
   possible). If Cloudpermit's endpoint stays stable for a year and the
   District adds attributes to the public map, revisit option B.

## 9. Open questions (owner)

1. Contact the District for the historical export before or after Phase 1?
2. Separate Pages project and subdomain, or a `/kitimat/` path under
   `yyc-permits.krevian.com`? (Recommend separate — the canonical tag and
   the "YYC" name do not fit.)
3. Snapshot commit vs. Deploy Hook for the weekly refresh (recommend hook).
4. Is a 69-row page worth shipping publicly now, or should Phase 2 wait on the
   Phase 0 answer? The BPER pane stands on its own either way.

## Sources

- Cloudpermit public records for Kitimat — <https://ca.cloudpermit.com/kitimat/public-records>
- BC Stats, Building Permits (BPER) — <https://catalogue.data.gov.bc.ca/dataset/building-permits-bper->
- District of Kitimat ArcGIS Server — <https://map.kitimat.ca/server/rest/services>
- BC Assessment — Permits (access-restricted) — <https://catalogue.data.gov.bc.ca/dataset/bc-assessment-permits>
- District of Kitimat, Building and Land Permitting — <https://www.kitimat.ca/en/business-and-development/building-and-land-development.aspx>
- Kitimat Municipal Code Part 13 (Building) — <https://www.kitimat.ca/municipal-office/part-13-building>
