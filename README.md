# permit-explorer

[![CI](https://github.com/shepherd70/permit-explorer/actions/workflows/ci.yml/badge.svg)](https://github.com/shepherd70/permit-explorer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A live, single-page tool for exploring City of Calgary permit data — all 490K+
building permits and 190K+ development permits across every community, queried
from Calgary's open-data API in your browser. One self-contained static HTML
file, no backend, served at the site root.

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

## Run / build

`src/city_explorer.html` is a self-contained static file — open it directly in a
browser (needs internet for the live API). To produce the deployable site:

```bash
npm run build      # python3 build.py  ->  dist/ (index.html + _headers, sitemap.xml, robots.txt)
```

`build.py` is standard-library Python (no dependencies): it publishes the
explorer as `dist/index.html` so it serves at the site root, and copies the
root-level deploy files — the Cloudflare [`_headers`](_headers), [`sitemap.xml`](sitemap.xml),
and [`robots.txt`](robots.txt) — into `dist/` alongside it (anything that must be
reachable at `/` has to be in `dist/`, since Cloudflare Pages serves that directory).

## Hosting

Deployed on **Cloudflare Pages** (Git integration). The explorer is the site
root (`index.html`); there is no second page or second URL.

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
npm test           # node test/city_harness.js
```

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

## Data & attribution

Permit data comes from City of Calgary Open Data —
[Building Permits (c2es-76ed)](https://data.calgary.ca/Business-and-Economic-Activity/Building-Permits/c2es-76ed)
and [Development Permits (6933-unw5)](https://data.calgary.ca/Business-and-Economic-Activity/Development-Permits/6933-unw5),
subject to the City's Open Data Terms of Use. This is an independent project, not
affiliated with or endorsed by The City of Calgary.

## License

[MIT](LICENSE).

## Project layout

```
build.py                publishes src/city_explorer.html as dist/ (+ passthrough deploy files)
src/city_explorer.html  the explorer (self-contained HTML/CSS/JS; no framework)
src/m0_validate.py      standalone dev utility: probes Calgary open-data feeds for freshness/schema
dist/                   deployable output (index.html + _headers, sitemap.xml, robots.txt); served at the site root
_headers                Cloudflare security headers + CSP
sitemap.xml, robots.txt SEO files, published to the deploy root by build.py
test/city_harness.js    headless verification harness
test/smoke.js           live-API smoke test
package.json            npm scripts (test / smoke / build); no dependencies
docs/                   design briefs, audit reports, and project documentation
.github/workflows/      CI (tests + dist-drift gate) and the daily live-API smoke test
.github/dependabot.yml  weekly GitHub Actions version updates
TASKS.md                development task tracker
```
