# permit-explorer — task tracker

Status values: `todo` | `in-progress` | `done` | `dropped`

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 1 | Profile raw permits CSV (schema, nulls, distributions) | done | 1,498 rows, 1999–2026; 74 rows missing cost; no row has both cost and sqft |
| 2 | Build interactive dashboard (KPIs, charts, filters, map, table) | done | Single-file HTML; Chart.js + Leaflet via CDN; data embedded |
| 3 | Add deep-dive analytics (buildout timeline, cost/DTI distributions, renovation lifecycle) | done | Renovation lifecycle pairs new-build → first renovation per address (107 pairs, median ~3.2 yrs) |
| 4 | Headless verification harness (Node, DOM stubs) | done | KPIs cross-checked against pandas; committed under test/ (see #6) |
| 5 | Set up repo (local C:\dev\permit-explorer + GitHub remote) | done | Private repo github.com/shepherd70/permit-explorer; main + session branch pushed |
| 6 | Commit verification harness as `test/harness.js` | done | test/harness.js + test/city_harness.js, self-extracting from the HTML; run with node |
| 7 | City-wide live API + community drill-down | done | src/city_explorer.html: live API explorer, all 490K+ permits, community/type/status filters |
| 8 | $/sqft analysis | dropped | No permit in current export has both cost and TotalSqFt |
| 9 | Harden city explorer: request-race guard | done | AbortController + per-request generation token in apply()/enterCity/enterDetail/cityTable so rapid filter/sort changes can't render stale data |
| 10 | Shareable URL filters + CSV export | done | Filters encoded in URL query string (read on load, written on apply); Export CSV button (client-side in detail mode, Socrata `.csv` endpoint capped at 50K in city mode) |
| 11 | Resilience & a11y polish | done | CDN-failure guard, 429 rate-limit message, empty-state pagination text, map region label, paginator aria-labels |
| 12 | Real test assertions + CI | done | Harnesses now assert (exit non-zero on failure) incl. a race-condition regression test; package.json `npm test`; GitHub Actions CI |
| 13 | Ship infra: LICENSE + Pages deploy | done | MIT LICENSE w/ Calgary data attribution; .github/workflows/pages.yml publishes explorer as site root |
| 14 | Launch: enable hosting for the city-wide explorer | todo | **Top priority.** pages.yml exists but Pages isn't enabled and the repo is private, so nothing is actually live. Either make the repo public + set Settings → Pages → Source: GitHub Actions, or pick alternative static hosting. Until this is done the deploy workflow is a no-op/failure. |
| 15 | Smoke test against the live Socrata API | todo | Both harnesses assert only against canned responses, so a schema/field/endpoint change at Calgary would break the live explorer silently. Add a lightweight scheduled (CI cron) check that hits the real c2es-76ed endpoint and verifies the expected fields still exist. |
| 16 | Offline dashboard data freshness | todo | dist/permit_dashboard.html embeds a point-in-time Harvest Hills export. Add a visible "data as of" date and document/automate the refresh, or formally designate the live explorer as the canonical public artifact and the offline file as a demo. |

## Log

- 2026-06-12 — Dashboard built and verified; deep-dive analytics added; repo created.
- 2026-06-12 — City-wide live-API explorer added: aggregate city mode + permit-level detail mode, community bubble map with drill-down, community/class/work/status filters.
- 2026-06-12 — Cost & days-to-issue distributions now work city-wide via server-side case() binning; detail threshold raised 8K -> 30K (any single year city-wide now unlocks detail mode).
- 2026-06-12 — Session closed: harnesses committed under test/; PR opened session/2026-06-12-repo-setup → main.
- 2026-06-13 — Redesigned src/city_explorer.html into a public-facing tool: hero + example questions, "how it works" disclosure, restyled toolbar/KPIs/cards/table, Okabe-Ito colourblind-safe chart palette, CARTO light/dark basemap, map legend, intentional loading/empty/error states, dark-mode toggle, accessibility (skip link, focus states, keyboard-sortable headers, reduced-motion). Live API, all filters, city/detail logic, and city_harness.js all preserved. Synced to dist/.
- 2026-06-13 — "Harden & ship v1.0" pass (tasks #9–13): fixed the request-race in the live explorer (AbortController + generation tokens); added shareable URL filters and CSV export; CDN-failure guard, 429 message, empty-state pagination, map/paginator a11y; rewrote both harnesses as real assertions (incl. an overlapping-apply race test) with `npm test`; added GitHub Actions CI + Pages deploy; added MIT LICENSE with Calgary data attribution; README updated (hosting, testing, data/license sections, clarified scope). Two survey findings were verified as false positives and skipped: detail-mode never truncates at 30K (it's only entered when total ≤ 30K), and the year dropdowns are already data-driven.
- 2026-06-14 — v1.0 shipped: PR #3 (session/2026-06-13-harden-ship-v1) merged to main via merge commit (22568e8); session branch deleted and stale refs pruned. All build/hardening work (tasks #1–13) now on main. Added forward-looking tasks #14–16 (hosting/launch, live-API smoke test, offline data freshness) as the next priorities.
