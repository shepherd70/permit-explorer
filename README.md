# permit-explorer

[![CI](https://github.com/shepherd70/permit-explorer/actions/workflows/ci.yml/badge.svg)](https://github.com/shepherd70/permit-explorer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A live, single-page tool for exploring City of Calgary permit data — all 490K+
building permits and 190K+ development permits across every community, queried
from Calgary's open-data API in your browser. One self-contained static HTML
file, no backend, served at the site root. A companion page at `/kitimat/`
covers the District of Kitimat, BC from a weekly data snapshot.

**Live at <https://yyc-permits.krevian.com/>.**

## Features

- **Two datasets behind one toggle** — Building permits (construction: cost,
  contractor, completion) and Development permits (the planning approvals that
  precede construction: permitted vs. discretionary use, land-use district,
  approval or refusal). Every surface below adapts to the active dataset; a
  `DATASETS` config registry holds each dataset's endpoint, fields, SoQL,
  columns and metrics
- Filters — year range, community, **category** (multi-select show/hide built
  from the data; development permits keep their 29% legacy-null rows visible as
  an "(uncategorized)" option), work type / permitted-vs-discretionary, status,
  and free-text search — that update every metric, chart, the map, and the
  table at once
- KPI cards — building: count, total/median estimated cost, housing units,
  days-to-issue, completion rate; development: count, discretionary share,
  released share, refusals, days-to-decision, **approval rate** (from the
  `decision` field: approvals ÷ decided)
- Charts: yearly volume, category mix, work type / permitted-vs-discretionary,
  monthly seasonality, top contractors / top applicants, processing- or
  decision-speed trend, cumulative buildout, cost and days-to-issue/-decision
  distributions, decision outcomes by year (development), and a
  renovation-lifecycle analysis (building permits)
- **Application → construction pipeline** (development view, one community
  drilled) — joins each released development permit to building-permit
  applications at the same parcel (unit addresses normalized to the parcel,
  multi-parcel permits expanded): share followed within 3 years and ever,
  median application→construction lag, share filed before the decision, and
  per-category conversion bars; one cached cross-dataset request per community
- Auto-computed insights that recalculate for the current filter (incl. SDAB
  appeal-hearing counts for development permits)
- Leaflet **community choropleth** shading each community by avg permits/year,
  avg project cost, avg days-to-issue/-decision, completion or approval rate
  (colour-blind-safe cividis ramp, boundaries fetched live); permit-level
  points coloured by category in detail view
- **Compare communities** — pick 2–4 and see the active dataset's metrics side
  by side (a metrics table + a permits-by-year chart), for the current filters
- Sortable, paginated permit table, shareable URL state (dataset + filters +
  map metric + compared communities), and CSV export of the current selection

With a broad filter the tool shows city totals computed by the server; narrow to
under 30,000 permits (a community, or one year city-wide) and it switches to
**detail view** — individual permits on the map, the records table, median
costs, and the renovation-lifecycle analysis.

### Kitimat companion page (`/kitimat/`)

A second, smaller explorer for the **District of Kitimat, BC** lives at
[`/kitimat/`](https://yyc-permits.krevian.com/kitimat/) (`src/kitimat_explorer.html`).
Kitimat publishes no open-data permit feed, so the page is built from a
**weekly snapshot** of three public sources (scoped in
[`docs/kitimat-scope.md`](docs/kitimat-scope.md)):

- **Construction activity since 2018** — BC Stats' monthly *Building Permits
  (BPER)* release for census subdivision 5949005: permit value by building type
  and dwelling units by type, with suppressed months kept as gaps and yearly
  totals labelled by months reported
- **Permits issued since December 2025** — every issued building permit in the
  District's public records (Cloudpermit): permit number, address, category,
  opened/issued dates and map location; joined at build time to the District's
  eight neighbourhood polygons (point-in-polygon; industrial lands fall
  "outside neighbourhoods") and to parcel OCP zoning by PID
- Filters (neighbourhood, year, category, search), KPIs, category / month /
  days-to-issue / neighbourhood / zoning charts, a neighbourhood choropleth with
  permit points, insights with small-count caveats, a sortable table, URL state
  and CSV export — no per-permit cost, contractor, units or status exist in the
  source, and the page says so

## Run / build

`src/city_explorer.html` is a self-contained static file — open it directly in a
browser (needs internet for the live API). To produce the deployable site:

```bash
npm run build      # python3 build.py  ->  dist/ (index.html, kitimat/index.html + _headers, sitemap.xml, robots.txt)
```

`build.py` is standard-library Python (no dependencies): it publishes the
explorer as `dist/index.html` so it serves at the site root, embeds the committed
Kitimat snapshot (`data/kitimat/`) into `src/kitimat_explorer.html` and writes it
as `dist/kitimat/index.html`, and copies the root-level deploy files — the
Cloudflare [`_headers`](_headers), [`sitemap.xml`](sitemap.xml), and
[`robots.txt`](robots.txt) — into `dist/` alongside them (anything that must be
reachable at `/` has to be in `dist/`, since Cloudflare Pages serves that directory).

The Kitimat snapshot is refreshed by `fetch_kitimat.py` (standard library only):

```bash
npm run smoke:kitimat   # python3 fetch_kitimat.py --check  — contract smoke test of the three sources
npm run fetch:kitimat   # python3 fetch_kitimat.py          — rewrite data/kitimat/snapshot.json + meta.json
```

Served from the repo root (e.g. `python3 -m http.server`), the unbuilt
`src/kitimat_explorer.html` falls back to fetching `data/kitimat/*.json`, so it
works without a build too.

## Hosting

Deployed on **Cloudflare Pages** (Git integration). The Calgary explorer is the
site root (`index.html`); the Kitimat page is served from the `/kitimat/`
directory of the same deploy.

**Canonical domain:** the page declares
`<link rel="canonical" href="https://yyc-permits.krevian.com/">`, matching
`robots.txt` and `sitemap.xml`. The legacy hostnames (`krevian.com` and
`www.krevian.com`) still serve the app with HTTP 200. Pages `_redirects` files
cannot redirect across hostnames, so the 301 lives in the Cloudflare
dashboard: **Account → Bulk Redirects** (or a zone Redirect Rule) sending
`krevian.com/*` and `www.krevian.com/*` to
`https://yyc-permits.krevian.com/$1`, status 301, preserving the query string.
Until that rule is active, search engines rely on the canonical link alone.

**Cloudflare Pages project settings:**

| Setting | Value |
|---|---|
| Build command | `python build.py` |
| Build output directory | `dist` |
| Framework preset | None |

`dist/` is committed, so the site serves correctly even if the build step is
skipped. [`_headers`](_headers) adds security headers and a Content-Security-Policy
scoped to the app's CDN/API origins; `build.py` copies it into `dist/`. The two
CDN assets (Chart.js, Leaflet) are loaded with Subresource Integrity (`integrity`
+ `crossorigin`) so a compromised CDN can't inject code.

## Testing

A headless harness (Node) self-extracts the explorer's inline script, stubs the
DOM / Chart.js / Leaflet, routes its canned Socrata responses by resource id
(one branch set per dataset), and asserts KPIs, charts, filtering, the category
filter (incl. the development-permits `(category IN … OR category IS NULL)`
branch), the dataset toggle (per-dataset KPI math, filter resets, cached option
lists, URL `ds=` round-trips), the choropleth, community comparison,
pagination, URL state, and the request-race guard. It exits non-zero on any
failed assertion.

```bash
npm test           # Calgary harness + Kitimat harness + Kitimat fetcher unit tests (all offline)
npm run test:calgary
npm run test:kitimat
```

The Kitimat page has its own harness (`test/kitimat_harness.js`, 71 checks)
that injects the **committed** snapshot into the page's JSON block and asserts
KPIs, BC Stats rollups (suppressed months as gaps), charts, the map (shaded
polygons, one marker per permit, click-to-filter), every filter, sorting,
pagination, CSV and dark mode; `test/test_fetch_kitimat.py` unit-tests the
fetcher's CSV parser, normaliser, point-in-polygon and polygon simplifier.

CI (`.github/workflows/ci.yml`) runs the build and the harness on every push and
pull request, and fails if the committed `dist/` has drifted from a fresh build.
Actions are pinned to commit SHAs and kept current by Dependabot
([`.github/dependabot.yml`](.github/dependabot.yml)).

`npm test` is deterministic and offline (canned API responses), so it can't
notice if Calgary changes the live datasets. A separate **live-API smoke test**
(`test/smoke.js`, `npm run smoke`) hits the real c2es-76ed and 6933-unw5
endpoints — sequentially, one dataset at a time — and verifies every field and
SoQL feature the explorer depends on still works; it self-extracts each
dataset's endpoint, field list and head query from the `DATASETS` registry in
`src/city_explorer.html` so it can't drift. A scheduled workflow
(`.github/workflows/smoke.yml`) runs it daily and on demand, emailing on
failure.

The Kitimat sources are checked the same way by `python3 fetch_kitimat.py --check`
(`npm run smoke:kitimat`). A weekly workflow
(`.github/workflows/kitimat-refresh.yml`) runs that check, re-fetches the
snapshot, rebuilds `dist/`, runs `npm test`, and — only when the data changed —
opens or updates a `bot/kitimat-refresh` pull request for review (it needs the
repository setting *Allow GitHub Actions to create and approve pull requests*).

## Data & attribution

Permit data comes from City of Calgary Open Data —
[Building Permits (c2es-76ed)](https://data.calgary.ca/Business-and-Economic-Activity/Building-Permits/c2es-76ed)
and [Development Permits (6933-unw5)](https://data.calgary.ca/Business-and-Economic-Activity/Development-Permits/6933-unw5),
subject to the City's Open Data Terms of Use. This is an independent project, not
affiliated with or endorsed by The City of Calgary.

Kitimat data comes from the
[District of Kitimat's public permit records](https://ca.cloudpermit.com/kitimat/public-records)
(via Cloudpermit), BC Stats'
[Building Permits (BPER)](https://catalogue.data.gov.bc.ca/dataset/building-permits-bper-)
release under the Open Government Licence – British Columbia, and neighbourhood
boundaries and parcel zoning from the
[District of Kitimat map server](https://map.kitimat.ca/server/rest/services).
Not affiliated with or endorsed by the District of Kitimat, BC Stats or the
Province of British Columbia.

## License

[MIT](LICENSE).

## Project layout

```
build.py                publishes src/city_explorer.html as dist/, embeds the Kitimat snapshot into dist/kitimat/ (+ passthrough deploy files)
fetch_kitimat.py        builds data/kitimat/ from Cloudpermit, BC Stats and the Kitimat ArcGIS server (--check = contract smoke)
src/city_explorer.html  the Calgary explorer (self-contained HTML/CSS/JS; no framework)
src/kitimat_explorer.html  the Kitimat companion page (same design system; reads the embedded snapshot)
src/m0_validate.py      standalone dev utility: probes Calgary open-data feeds for freshness/schema
data/kitimat/           committed weekly snapshot (snapshot.json: permits, BC Stats series, neighbourhood polygons; meta.json)
dist/                   deployable output (index.html, kitimat/index.html + _headers, sitemap.xml, robots.txt); served at the site root
_headers                Cloudflare security headers + CSP
sitemap.xml, robots.txt SEO files, published to the deploy root by build.py
test/city_harness.js    headless verification harness (Calgary)
test/kitimat_harness.js headless verification harness (Kitimat, against the committed snapshot)
test/test_fetch_kitimat.py  unit tests for the Kitimat fetcher's parsers and geometry helpers
test/smoke.js           live-API smoke test (Calgary)
package.json            npm scripts (test / smoke / fetch / build); no dependencies
docs/                   design briefs, scope documents, audit reports, and project documentation
.github/workflows/      CI (tests + dist-drift gate), the daily live-API smoke test, and the weekly Kitimat snapshot refresh
.github/dependabot.yml  weekly GitHub Actions version updates
TASKS.md                development task tracker
```
