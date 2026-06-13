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
| 7 | Support other communities / city-wide exports | done | src/city_explorer.html: live API explorer, all 490K+ permits, community/type/status filters |
| 8 | $/sqft analysis | dropped | No permit in current export has both cost and TotalSqFt |

## Log

- 2026-06-12 — Dashboard built and verified; deep-dive analytics added; repo created.
- 2026-06-12 — City-wide live-API explorer added: aggregate city mode + permit-level detail mode, community bubble map with drill-down, community/class/work/status filters.
- 2026-06-12 — Cost & days-to-issue distributions now work city-wide via server-side case() binning; detail threshold raised 8K -> 30K (any single year city-wide now unlocks detail mode).
