# permit-explorer

Interactive dashboard for exploring City of Calgary building-permit data
(currently the Harvest Hills community, 1999–2026).

The output is a single self-contained HTML file — data embedded, works offline,
share it by sending the file.

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

## Usage

```bash
pip install pandas
python build.py                       # uses newest CSV in data/raw/
python build.py path/to/export.csv    # or an explicit export
```

Open `dist/permit_dashboard.html` in any browser.

## Updating the data

Download a fresh export from Calgary's open-data portal, drop it in
`data/raw/`, and re-run `python build.py`.

## Project layout

```
build.py            build script: CSV -> dist/permit_dashboard.html
src/template.html   dashboard UI (HTML/CSS/JS, __DATA__ placeholder)
data/raw/           raw CSV exports (input)
dist/               built dashboards (output, generated)
TASKS.md            development task tracker
```
