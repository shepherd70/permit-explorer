# permit-explorer

A live, single-page tool for exploring City of Calgary building-permit data —
all 490K+ permits across every community, queried from Calgary's open-data API
in your browser. One self-contained static HTML file, no backend, served at the
site root.

**Live at <https://krevian.com/>.**

## Features

- Filters — year range, community, **permit category** (multi-select show/hide:
  Single Family, Commercial, Two Family, …, built from the data), work type,
  status, and free-text search — that update every metric, chart, the map, and
  the table at once
- KPI cards: permit count, total/median estimated cost, housing units,
  median days-to-issue, completion rate
- Charts: yearly volume vs. construction value, permit-class mix, work type,
  monthly seasonality, top contractors, processing-speed trend, cumulative
  buildout, cost and days-to-issue distributions, and a renovation-lifecycle
  analysis (years from new build to first renovation at the same address)
- Auto-computed insights that recalculate for the current filter
- Leaflet **community choropleth** shading each community by avg permits/year,
  avg project cost, avg days-to-issue, or completion rate (colour-blind-safe
  cividis ramp, boundaries fetched live); permit-level points sized by cost and
  coloured by class in detail view
- **Compare communities** — pick 2–4 and see permits, cost, processing speed and
  completion side by side (a metrics table + a permits-by-year chart), for the
  current filters
- Sortable, paginated permit table, shareable URL state (filters + map metric +
  compared communities), and CSV export of the current selection

With a broad filter the tool shows city totals computed by the server; narrow to
under 30,000 permits (a community, or one year city-wide) and it switches to
**detail view** — individual permits on the map, the records table, median
costs, and the renovation-lifecycle analysis.

## Run / build

`src/city_explorer.html` is a self-contained static file — open it directly in a
browser (needs internet for the live API). To produce the deployable site:

```bash
npm run build      # python build.py  ->  dist/index.html (+ dist/_headers)
```

`build.py` is standard-library Python (no dependencies): it publishes the
explorer as `dist/index.html` so it serves at the site root, and copies the
Cloudflare [`_headers`](_headers) file alongside it.

## Hosting

Deployed on **Cloudflare Pages** (Git integration). The explorer is the site
root (`index.html`); there is no second page or second URL.

**Cloudflare Pages project settings:**

| Setting | Value |
|---|---|
| Build command | `python build.py` |
| Build output directory | `dist` |
| Framework preset | None |

`dist/` is committed, so the site serves correctly even if the build step is
skipped. [`_headers`](_headers) adds security headers and a Content-Security-Policy
scoped to the app's CDN/API origins; `build.py` copies it into `dist/`.

## Testing

A headless harness (Node) self-extracts the explorer's inline script, stubs the
DOM / Chart.js / Leaflet, and asserts KPIs, charts, filtering, the permit-category
filter, the choropleth (incl. the avg-permits/year metric and boundary-load
recovery), community comparison, pagination, URL state, and the request-race
guard. It exits non-zero on any failed assertion.

```bash
npm test           # node test/city_harness.js
```

CI (`.github/workflows/ci.yml`) runs the build and the harness on every push and
pull request.

`npm test` is deterministic and offline (canned API responses), so it can't
notice if Calgary changes the live dataset. A separate **live-API smoke test**
(`test/smoke.js`, `npm run smoke`) hits the real c2es-76ed endpoint and verifies
every field and SoQL feature the explorer depends on still works — it
self-extracts the field list and endpoint from `src/city_explorer.html` so it
can't drift. A scheduled workflow (`.github/workflows/smoke.yml`) runs it daily
and on demand, emailing on failure.

## Data & attribution

Building-permit data comes from City of Calgary Open Data —
[Building Permits (c2es-76ed)](https://data.calgary.ca/Business-and-Economic-Activity/Building-Permits/c2es-76ed),
subject to the City's Open Data Terms of Use. This is an independent project, not
affiliated with or endorsed by The City of Calgary.

## License

[MIT](LICENSE).

## Project layout

```
build.py                publishes src/city_explorer.html as dist/index.html (+ _headers)
src/city_explorer.html  the explorer (self-contained HTML/CSS/JS; no framework)
dist/                   deployable output (index.html + _headers); served at the site root
_headers                Cloudflare security headers + CSP
test/city_harness.js    headless verification harness
test/smoke.js           live-API smoke test
docs/                   design briefs and project documentation
.github/workflows/      CI (tests) and the daily live-API smoke test
TASKS.md                development task tracker
```
