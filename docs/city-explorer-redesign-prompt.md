# Redesign brief: Calgary Building Permits Explorer

You are a senior product designer and front-end engineer. I'm attaching a working single-file HTML dashboard, `city_explorer.html`. Redesign it into a polished, modern, **public-facing** data tool that any Calgarian or curious visitor can land on and use with confidence — without losing any of its analytical depth.

## What the file is today
- A single, self-contained HTML page (HTML + CSS + vanilla JS).
- Pulls **live** data from the City of Calgary open-data API (Socrata dataset `c2es-76ed`) — nothing is hardcoded.
- Uses Chart.js and Leaflet via CDN.
- Contains: a filter bar (year range, community, permit class, work type, status, free-text search, and reset), KPI cards, an interactive map, ~10 charts, an auto-generated insights panel, and a sortable, paginated records table.
- Switches between a "city mode" (aggregates) and a "detail mode" (per-permit views) when the result set drops below ~30,000 permits.

## Goal
Modern, clean, trustworthy, approachable. A first-time visitor should immediately grasp **what this is, where the data comes from, and how to use it** — while a power user keeps every filter and chart they'd want.

## Scope of work
1. **Keep it one self-contained HTML file** — no build step, no backend, no login. CDN dependencies are fine. It must remain hostable as a single static file (e.g. GitHub Pages or Netlify).
2. **Add a clear intro / hero**: a plain-language explanation of what the tool shows, plus 2–3 example questions it can answer (e.g. "Which communities are building the most?", "How long do permits take to get issued?").
3. **Weave in lightweight guidance** — how the filters work, and what "city" vs "detail" mode means — without a wall of text.
4. **Redesign the entire visual layer**: typography, spacing, colour, the filter bar, KPI cards, charts, map, table, insights panel, and footer.
5. **Make data provenance obvious**: clear attribution to City of Calgary open data, a note that data is pulled live on load, and a short "how this works / methodology" blurb.
6. **Make the loading, empty (no results), and error states look intentional**, not like afterthoughts.

## Must preserve — do not break
- The live Socrata API integration and all existing SoQL queries.
- Every filter and the reset button.
- The city-mode / detail-mode logic and the ~30k threshold behaviour.
- All charts, the Leaflet map (community bubbles + click-to-drill), the auto-computed insights, and the sortable, paginated table.
- All current interactions: column-sort, drill into a community, map popups, and pagination.

Keep everything pulling live data — do not substitute mock or static data.

## Design direction (modern & clean)
Treat these as strong defaults; refine as needed.
- **Type**: one clean modern sans (a system stack, or Inter via Google Fonts). Clear type scale, generous line-height, tabular figures for all numbers.
- **Layout**: generous whitespace, a consistent 8px spacing scale, strong alignment, a sensible max content width. Let the data breathe.
- **Colour**: a mostly neutral UI with one or two restrained accents. Unify the chart palette into something cohesive and colourblind-friendly (you may keep the current seaborn-style hues if you harmonise them). Meet WCAG AA contrast throughout.
- **Cards & surfaces**: consistent radius, subtle borders or soft shadows — avoid heavy drop shadows.
- **Charts**: clean axes, muted gridlines, legible labels, consistent legends, and tooltips styled to match the UI.
- **Map**: a light, desaturated basemap that fits the palette; legible markers and a small legend.
- **Motion**: subtle, purposeful transitions only — nothing flashy. Respect `prefers-reduced-motion`.
- A clean **light theme** by default. A tasteful dark-mode toggle is welcome but optional.

## Accessibility & responsiveness (this is a public tool)
- Responsive from desktop down to ~360px: the filter bar wraps gracefully, the table scrolls or reflows, and the map and charts resize.
- Keyboard-navigable controls with visible focus states.
- Sufficient colour contrast everywhere.

## Out of scope / please avoid
- No signup, pricing, or marketing fluff — it's a free public tool.
- No analytics or third-party tracking scripts.
- No placeholder / lorem text.
- Don't drop analytical features in the name of simplicity.

## Deliverable
One updated, self-contained `city_explorer.html` that works end-to-end and is ready to host. At the end, briefly note any meaningful design decisions or trade-offs you made.
