# permit-explorer

Interactive tools for exploring City of Calgary building-permit data. Two
dashboards share the same analytics:

1. **City-wide explorer** — a live tool covering all 490K+ permits across every
   community, querying Calgary's open-data API in your browser. Always current.
2. **Offline community dashboard** — a single self-contained HTML file with the
   data embedded; works without internet and is shareable by sending the file
   (the example build ships the Harvest Hills community, 1999–2026).

## Features

- Filters (year range, permit class, work type, status, free-text search) that
  update every metric, chart, map point, and table row at once
- KPI cards: permit count, total/median estimated cost, housing units,
  median days-to-issue, completion rate
- Charts: yearly volume vs. construction value, permit-class mix, work type,
  monthly seasonality, top contractors, processing-speed trend, cumulative
  neighborhood buildout, cost and days-to-issue distributions, and a
  renovation-lifecycle analysis (years from new build to first renovation at
  the same address)
- Auto-computed insights that recalculate for the current filter
- Leaflet map with points sized by cost and colored by permit class
- Sortable, paginated permit table

## Two dashboards

1. **City-wide explorer** (`src/city_explorer.html`, also copied to `dist/`) —
   just open it in a browser (needs internet). Queries Calgary's open-data API
   live: all 490K+ permits, every community, always current. Aggregated city
   view (including cost and days-to-issue distributions via server-side
   binning); filter to under 30,000 permits (a community, or one year
   city-wide) to unlock permit-level detail, renovation lifecycle, and
   individual map points. Filters are encoded in the URL, so any view can be
   shared or bookmarked, and the current selection can be exported to CSV.
2. **Offline single-community dashboard** (`dist/permit_dashboard.html`) —
   self-contained file built from a CSV export; works without internet.

## Usage (offline dashboard)

```bash
pip install -r requirements.txt       # just pandas
python build.py                       # uses newest CSV in data/raw/
python build.py path/to/export.csv    # or an explicit export
```

Open `dist/permit_dashboard.html` in any browser.

## Updating the data

Download a fresh export from Calgary's open-data portal, drop it in
`data/raw/`, and re-run `python build.py`.

## Hosting the city-wide explorer

`src/city_explorer.html` is a static file that talks to the live API, so it can
be hosted anywhere. A GitHub Pages workflow (`.github/workflows/pages.yml`) is
included that publishes it as the site root (`index.html`) alongside the offline
dashboard. To enable it: **Settings → Pages → Source: GitHub Actions**, then push
to `main`. Note that GitHub Pages on a *private* repo requires a paid plan — make
the repo public to host it for free.

## Testing

Headless harnesses (Node) self-extract the dashboard scripts, stub the DOM /
Chart.js / Leaflet, and assert KPIs, charts, filtering, pagination, and the
request-race guard. They exit non-zero on any failed assertion.

```bash
python build.py    # offline harness checks the built dist file
npm test           # runs test/harness.js and test/city_harness.js
```

CI (`.github/workflows/ci.yml`) runs the build and both harnesses on every push
and pull request.

## Data & attribution

Building-permit data comes from City of Calgary Open Data —
[Building Permits (c2es-76ed)](https://data.calgary.ca/Business-and-Economic-Activity/Building-Permits/c2es-76ed),
subject to the City's Open Data Terms of Use. This is an independent project, not
affiliated with or endorsed by The City of Calgary.

## License

[MIT](LICENSE).

## Project layout

```
build.py                build script: CSV -> dist/permit_dashboard.html
src/template.html       offline dashboard UI (HTML/CSS/JS, __DATA__ placeholder)
src/city_explorer.html  city-wide live-API explorer (no build step; copied to dist/)
data/raw/               raw CSV exports (input; ships one Harvest Hills export)
dist/                   dashboards (open these in a browser)
test/                   headless Node verification harnesses
docs/                   design briefs and project documentation
.github/workflows/      CI (tests) and GitHub Pages deploy
TASKS.md                development task tracker
```
