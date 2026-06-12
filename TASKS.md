# permit-explorer — task tracker

Status values: `todo` | `in-progress` | `done` | `dropped`

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 1 | Profile raw permits CSV (schema, nulls, distributions) | done | 1,498 rows, 1999–2026; 74 rows missing cost; no row has both cost and sqft |
| 2 | Build interactive dashboard (KPIs, charts, filters, map, table) | done | Single-file HTML; Chart.js + Leaflet via CDN; data embedded |
| 3 | Add deep-dive analytics (buildout timeline, cost/DTI distributions, renovation lifecycle) | done | Renovation lifecycle pairs new-build → first renovation per address (107 pairs, median ~3.2 yrs) |
| 4 | Headless verification harness (Node, DOM stubs) | done | KPIs cross-checked against pandas; harness lives in session scratchpad — consider committing |
| 5 | Set up repo (local C:\dev\permit-explorer + GitHub remote) | done | Private repo github.com/shepherd70/permit-explorer; main + session branch pushed |
| 6 | Commit verification harness as `test/harness.js` | todo | Port from scratchpad; stub quirks documented in session notes |
| 7 | Support other communities / city-wide exports | todo | Map center & title are currently Harvest Hills-specific; derive from data |
| 8 | $/sqft analysis | dropped | No permit in current export has both cost and TotalSqFt |

## Log

- 2026-06-12 — Dashboard built and verified; deep-dive analytics added; repo created.
