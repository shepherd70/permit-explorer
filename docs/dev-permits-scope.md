# Development Permits — feature scope

**Status:** proposal (scoping only — no app code). Tracker task #34.
**Scoped:** 2026-08-28, every dataset claim below verified against the live API that day.

The explorer currently shows one dataset: City of Calgary **Building Permits**
(`c2es-76ed`, ~498,680 rows live). This document scopes adding **Development
Permits** (`6933-unw5`) as a second dataset — what the data supports, the
recommended UI shape, what changes on every surface, how the tests extend, the
risks, and a phased plan.

## 1. Why development permits

A development permit is the planning/land-use approval that precedes most
construction: whether a proposed use is permitted or discretionary in its
land-use district, and whether the city approved or refused it (with a route of
appeal to the SDAB). Building permits say what got *built*; development permits
say what was *proposed and decided*. Adding them lets the tool answer a new
family of questions:

- Which communities have the most development applications (vs. construction)?
- How long do decisions take? (avg ≈ **51 days** applied→decision, vs ≈ 24 days
  applied→issued for building permits)
- What share of applications is discretionary vs. permitted use?
- What gets refused, and where?
- What's proposed in my neighbourhood — secondary suites, multi-family, signs,
  change of use?

## 2. The dataset (verified live 2026-08-28)

| Fact | Value |
|---|---|
| Dataset | [Development Permits (6933-unw5)](https://data.calgary.ca/Business-and-Economic-Activity/Development-Permits/6933-unw5) |
| Rows | **192,471** |
| Date range | `applieddate` 1979-01-04 → today |
| Host | `data.calgary.ca` — same Socrata host, so **no CSP / `_headers` change** |
| SoQL parity | Every feature the app uses works on this dataset: `date_extract_y/m`, `date_diff_d`, `avg`/`sum`/`count(field)`, `case()` binning, `IN` filters, the `.csv` export endpoint |
| Geo/community coverage | `latitude` and `communityname` 99.7% (191,808 of 192,471) |
| `decisiondate` coverage | 90.3% (173,737) |
| Community join | Same `communityname` vocabulary as building permits (top: BELTLINE 4,002, DOWNTOWN COMMERCIAL CORE 3,073) → the `surr-xmvs` boundary join and choropleth work **unchanged** |
| Detail threshold | Whole city (192K) > 30K → city mode; the biggest single community (4,002) and any single year (≤ ~9.5K) flip to detail mode. `DETAIL_THRESHOLD` unchanged. |

Key distributions:

- **statuscurrent** — Released 143,824 · Cancelled 19,097 · Expired 13,612 ·
  Lapsed 7,134 · Refused 4,329 · in-flight tail (Pending Release 1,259, Hold
  801, In Advertising 800, In Circulation 370, Under Review 268, …). Different
  vocabulary from building permits.
- **decision** — Approval 168,676 · Refusal 5,376 · Deemed Refusal 69 · Revoked
  8 · N/A 1,836 · null 16,506. Approval rate among decided ≈ **96.9%**.
- **permitteddiscretionary** — Discretionary 117,357 · Permitted 44,801 ·
  Permitted with a Relaxation 30,093 (+3 tiny values).
- **category** — 45 real values (Relaxation - Existing - Residential 15,415,
  Residential - Secondary Suite 14,621, Home Occupation Class 2 11,276, …)
  **plus 56,629 null (29%)**. The null is a legacy artifact: pre-2000 rows have
  essentially no category (2 of 40,605). 1979–88 volumes are a trickle
  (45–129/yr), jumping to ~3K/yr from 1989; the city itself flags 1979–2000 as
  legacy/incomplete.

Fields not present (all load-bearing in the current UI): **no
`estprojectcost`, no `housingunits`, no `contractorname`, no `workclass` /
`permitclassgroup`, no `issueddate`.** Fields unique to DPs: `category`,
`applicant`, `permitteddiscretionary`, `landusedistrict(+description)`,
`proposedusecode/description`, `decision`, `decisionby`, `decisiondate`,
`releasedate`, `mustcommencedate`, `canceledrefuseddate`, the four `sdab*`
appeal fields, and multi-parcel `location*` fields.

## 3. Concept mapping

| Concept | Building permits | Development permits |
|---|---|---|
| Endpoint | `c2es-76ed` | `6933-unw5` |
| Applied | `applieddate` | `applieddate` |
| "Resolved" date | `issueddate` | `decisiondate` (`releasedate` is a later milestone) |
| Processing speed | days to issue (avg ≈ 24 d) | days to decision (avg ≈ 51 d, same `case(≥0)` guard) |
| Category filter | `permitclassgroup` (16 values) | `category` (45 + null → "(uncategorized)") |
| Secondary filter | `workclass` | `permitteddiscretionary` |
| Status filter | `statuscurrent` | `statuscurrent` (different value set) |
| Outcome KPI | completion rate | **approval rate** = Approval ÷ (Approval + Refusal + Deemed Refusal), from the `decision` field |
| Money | `estprojectcost` | — (none) |
| Housing units | `housingunits` | — (none) |
| Entity | `contractorname` | `applicant` (permit expediters dominate: ARC Surveys 2,021, John Trinh 1,650, …) |
| Address | `originaladdress` | `address` |
| Lat/lng | `latitude`/`longitude` (text) | same |

Computing the outcome KPI from `decision` (not from a status partition, as the
building-permit completion rate does) is deliberate: it avoids depending on an
enumerated open-status list in a vocabulary we don't control, and Refusal is
the interesting rare event.

## 4. Recommended UI shape: a dataset toggle

A two-option segmented control — **Building · Development** — at the start of
the toolbar row (it changes the meaning of everything below, and the toolbar is
sticky). Building permits stay the default; URL state gains `ds=dp` (omitted
for the default, like every other default).

Rejected alternatives:

- **Merged/union view.** Socrata cannot aggregate across two datasets in one
  query, and city mode is 100% server aggregates — every chart would need two
  requests plus a client-side merge, half the fields (cost, units) exist on
  only one side, and a single project often has both a DP and a BP, so merged
  counts would double-count activity.
- **Enrichment only** (DPs shown inside building-permit detail view). Hides
  192K records behind a drill-down and can't answer any city-wide DP question.
  Its one good idea — address-level linkage — returns as Phase 4.

Toggle behavior: swap the active dataset config, rebuild the data-driven filter
options (years, communities, categories, work/status), reset dataset-specific
filters (categories / work / status / search), keep the year range and
community selection where valid (both datasets share the community
vocabulary), keep the compare-communities selection, re-run `apply()`. The
per-dataset init option lists are cached so toggling back does not refetch
them.

## 5. Surface-by-surface changes (DP mode)

- **Copy/SEO** — hero lede and `<meta name=description>` currently say
  "building-permit records"; update to cover both. `<title>` ("Calgary
  Building Permits Explorer") → "Calgary Permits Explorer" or similar. "How
  this works" gains a DP paragraph, the legacy-data caveat, and the second
  source link; the footer attribution adds the `6933-unw5` link. Single URL —
  no sitemap change.
- **KPI row** — drop Total est. cost, Avg/Median cost, Housing units. Proposed
  six: Permits · Avg (median in detail) days to decision · Approval rate ·
  % discretionary · Released share · Refusals count. Finalize against live
  numbers at implementation; the grid auto-fits if we run five.
- **Charts** — volume by year (bars only, or line = decisions made); category
  doughnut (top 9, as today); permitted-vs-discretionary bar (replaces work
  type); seasonality unchanged; top applicants (replaces top contractors);
  days-to-decision trend (replaces processing speed); cumulative permits (drop
  the units axis); days-to-decision distribution with re-binned buckets for
  the ~51-day average (0–7 / 8–14 / 15–30 / 31–60 / 61–90 / 91–180 / 180+ d).
  **Dropped in DP mode:** cost distribution, renovation lifecycle. Candidate
  replacement card: decision outcomes by year (stacked Approval/Refusal).
- **Map** — city choropleth metrics: avg permits/yr · avg days to decision ·
  approval rate (cost dropped; `?metric=cost` falls back to `ppy` under
  `ds=dp`). Detail points: fixed radius (no cost to size by), coloured by
  category; popup shows status, decision, category, land-use district,
  applicant.
- **Table** — Permit # · Applied · Status · Decision · Community · Category ·
  Permitted/Disc. · Land use district · Applicant · Address · Description;
  server-side sort as today. Status pill palette needs DP status colours.
- **Search** (detail, client-side) — id / address / applicant / description /
  community / category / land-use district / status.
- **CSV export** — DP field list, same formula-neutralization, filename
  `calgary-dev-permits-<date>.csv`; city-mode streaming export hits
  `6933-unw5.csv`.
- **Compare communities** — same panel; rows become permits · avg days to
  decision · approval rate · % discretionary · avg permits/yr.
- **Insights** — per-dataset templates (busiest year, top applicant, most
  active community, % refused, seasonal peak; SDAB appeals count when > 0).

## 6. Architecture

A `DATASETS` config registry plus a `D.ds` pointer, with **every** hardcoded
endpoint/field reference moved behind it — the `API` const, `where()`/
`cmpWhere()`, `init()`'s five option queries, `enterCity()`'s nine aggregates,
`enterDetail()`'s field list and row mapping, `cityTable()`, `cmpRun()`,
`exportCsv()`, `COLS`, `CHORO_METRICS`, the DTI bins, KPI definitions, and the
insight templates. This refactor is the single biggest cost of the feature and
is why Phase 1 lands it with zero behavior change.

Sketch:

```js
const DATASETS = {
  bp: { id:'c2es-76ed', label:'Building', catField:'permitclassgroup', catNullable:false,
        secondary:{field:'workclass',label:'Work type'}, entity:{field:'contractorname',label:'contractor'},
        resolvedDate:'issueddate', hasCost:true, hasUnits:true, addr:'originaladdress',
        kpis:[…], charts:{…}, choroMetrics:{…}, dtiBins:[…], cols:[…], csvFields:[…], openStatuses:[…] },
  dp: { id:'6933-unw5', label:'Development', catField:'category', catNullable:true,
        secondary:{field:'permitteddiscretionary',label:'Permitted / discretionary'}, entity:{field:'applicant',label:'applicant'},
        resolvedDate:'decisiondate', hasCost:false, hasUnits:false, addr:'address',
        decided:"decision IN ('Approval','Refusal','Deemed Refusal')", approved:"decision='Approval'", … }
};
```

- **Null category** — the "(uncategorized)" checkbox maps to an `IS NULL`
  branch: `(category IN (…) OR category IS NULL)`. Verified live to the row:
  `Home Occupation Class 2` + null = 67,905 = 11,276 + 56,629.
- **URL state** — `ds=dp` added; `cats`/`work`/`status`/`q` are
  dataset-scoped and dropped on switch; `y1`/`y2`/`comm`/`cmp`/`metric`
  carry over (with the cost-metric fallback). `readURL()` applies `ds` first.
- **Contracts preserved** — single inline `<script>` (harness eval), guarded
  browser-only APIs, `esc()`/`csvCell()` untouched, `DETAIL_THRESHOLD`
  unchanged, `build.py` untouched (still one page at the site root).
- **Perf** — no change for building-permit users (zero extra requests until
  the toggle is used); a switch costs one cached init-options round plus a
  normal `apply()`. Boundaries GeoJSON is shared.

## 7. Testing

- **`test/city_harness.js`** — the fetch stub gains a dataset dimension:
  route on the resource id in the URL (`c2es-76ed` vs `6933-unw5`) before the
  existing select/group routing. New canned DP responses (head, yearly,
  category incl. nulls, permitted/discretionary, statuses, communities, bins,
  detail rows incl. refused and null-category rows). New assertions: toggle
  rebuilds filters and re-queries; DP KPI math (approval rate =
  A ÷ (A+R+DR); days-to-decision); the `IS NULL` branch appears in `where()`
  exactly when "(uncategorized)" is checked; `ds=` URL round-trip and
  dataset-scoped param dropping; cost cards absent in DP mode; DP table
  columns; compare metrics. All 119 existing building-permit checks must pass
  unchanged.
- **`test/smoke.js`** — currently self-extracts a single `const API` and
  `const fields`; parameterize the extraction over the `DATASETS` registry and
  run its six checks (field selectability with per-field 400 diagnosis,
  plausible count, year histogram, per-dataset head aggregates, `case()`
  bins, CSV header) against **both** endpoints, sequentially to stay
  rate-limit-friendly.
- **Live verification** — badge counts vs. the portal, one community
  spot-check (Beltline 4,002), approval-rate spot-check, the IS-NULL count
  identity (already verified in scoping).
- **CI** — unchanged; dist-drift gate keeps applying (rebuild `dist/` with
  every src commit).

## 8. Risks and decisions

1. **29% null category** — must stay visible as "(uncategorized)"; silently
   dropping it would understate every metric. About-note the legacy cause.
2. **Legacy era (1979–2000)** — keep the full data-driven year range with an
   About caveat (the city's own wording), rather than a special DP default.
3. **Status vocabulary drift** — DP statuses are a filter only; no formula
   depends on enumerating them (the outcome KPI reads `decision`), so a new
   status value can't silently corrupt a metric.
4. **Multi-parcel permits** — `locationcount` > 1 with `locationsgeojson`
   multipoints; v1 plots the single `latitude`/`longitude` like the city's own
   portal map. Multipoint rendering is later polish.
5. **Stale URL params across datasets** — a shared `?ds=dp&cats=Garage` link
   must not silently filter to nothing; dropping dataset-scoped params on
   switch and validating on read handles it.
6. **Permit numbers** are prefixed (`BP…`/`DP…`) — no cross-dataset ambiguity
   in tables or exports.

## 9. Phasing

| Phase | Content | Size |
|---|---|---|
| 1 | Config-extraction refactor, **zero behavior change** — `DATASETS.bp` only; every hardcoded field/endpoint moved behind the registry; all 119 harness checks green unchanged | ~1 session |
| 2 | DP mode — toggle, `DATASETS.dp`, per-surface changes (§5), URL `ds=`, copy | ~1–2 sessions |
| 3 | Harness + smoke extension, README/About/footer, live verification, dist rebuild | folds into 2 |
| 4 (separate task) | **Application→construction pipeline**: in detail view, join DPs to building permits by address within the drilled community — share of released DPs followed by a BP, median lag. The genuinely novel analysis two datasets unlock; needs its own scoping first (measure the address-string join rate between `address` and `originaladdress`). Also: SDAB appeal insight. | scope later |

## 10. Open questions (owner)

1. Toggle placement — recommended: first control in the sticky toolbar row.
2. DP KPI six-pack — recommended set in §5; final pick at implementation.
3. Phase 4 in or out — recommended: log as its own follow-up task, not in v1.
4. `<title>`/H1 wording change ("Building Permits Explorer" → covers both) —
   minor SEO churn on a page whose canonical/sitemap don't change; recommended:
   do it in Phase 2 with the copy pass.
