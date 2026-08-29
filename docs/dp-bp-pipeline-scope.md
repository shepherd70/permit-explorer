# Application → construction pipeline (DP→BP address join) — feature scope

**Status:** proposal (scoping only — no app code). Tracker task #35.
**Scoped:** 2026-08-29; every measurement below taken against the live API that day.

Task #34 shipped development permits (`6933-unw5`) beside building permits
(`c2es-76ed`). This scopes the analysis the two datasets unlock *together*:
in development-permit detail view, join released DPs to building-permit
applications at the same parcel and answer — **what share of approved
applications actually proceed to construction, and how fast?**

## 1. Feasibility: the join, measured

DP `address` and BP `originaladdress` use the identical format (`1108 4 ST
SW`); ~10.4% of DP and ~10.0% of BP addresses carry a `#UNIT ` prefix
(`#440 318 11 AV SE`); neither field ever contains `;` or `,`; DP
multi-parcel permits list every parcel in `locationaddresses` (';'-joined).
Coverage: DP `address` 192,404/192,471 (99.97%), BP `originaladdress`
497,754/498,680 (99.8%).

Join measured on all released DPs across five deliberately different
communities (dense core, infill, two suburbs, industrial), against each
community's full BP history. **n0** = uppercase + whitespace-collapse,
exact; **n1** = n0 + strip the leading `#unit ` (parcel key) + expand DP
keys with `locationaddresses`:

| Community | rel. DPs | BPs | n0 match | n1 match | followed by a BP |
|---|---|---|---|---|---|
| Beltline | 2,519 | 6,120 | 89.6% | 91.7% | 82.0% |
| Altadore | 2,087 | 5,071 | 91.2% | 92.1% | 79.6% |
| Evergreen | 841 | 9,459 | 87.9% | 88.7% | 30.9% |
| Saddle Ridge | 1,919 | 11,430 | 96.8% | 98.2% | 33.8% |
| Greenview Industrial | 688 | 603 | 77.3% | 83.0% | 68.8% |
| **Total** | **8,054** | | **90.5%** | **92.3%** | 63.4% |

**The address join works: 92.3% of released DPs find their parcel in the BP
data.** The *followed-by* spread (31–82%) is not join failure — it is the
DP category mix, and that is the analysis's actual signal:

| Category (released, 5 communities, n≥100) | n | followed by a BP |
|---|---|---|
| Residential - Contextual Dwelling | 309 | **97.7%** |
| Residential - New Single / Semi / Duplex | 825 | **94.7%** |
| Change of Use - Discretionary/Relaxations | 622 | 85.0% |
| Renovations - Non-Residential | 182 | 84.6% |
| Residential - Multi-Family | 138 | 81.9% |
| Signs (all three variants) | 754 | 71–78% |
| Relaxation - Existing - Residential | 724 | 29.7% |
| Residential - Secondary Suite | 1,008 | **19.1%** |
| Home Occupation Class 2 | 216 | 13.4% |
| Relaxation - Existing - Compliance Follow-Up | 170 | **9.4%** |

Construction-implying approvals convert at 82–98%; paper approvals
(relaxations for existing buildings, home occupations, suite
legalizations) barely convert at all. That contrast is the insight the
card should surface, not hide.

## 2. The BP-data floor (load-bearing correction)

`c2es-76ed` starts at **1999-06-22** while DPs go back to 1979 — a 1985
DP's real follow-up BP predates the BP dataset, so any pre-1999 DP scored
against it produces spurious "followed by" hits from later unrelated
permits. **The pipeline population must be restricted to DPs applied on or
after the BP data's first year** (data-driven from the bp year list, not
hardcoded). Re-measured on that restricted population (released, ≥1999,
same five communities, n=7,248):

- **62.3% followed** by a BP application at the same parcel
- median lag **127 days**, DP application → first BP application
  (measured application-to-application, so never negative)
- **18.2%** of follow-ups were applied while the DP was still undecided
  (concurrent processing — common in infill: Altadore's median lag from
  *release* is −1 day)
- follow-up share by window: within 1 y **44.2%**, 3 y **52.4%**, 5 y
  **55.8%** — an unbounded window adds ~7 pp of increasingly dubious
  matches beyond 3 years

Lag measured from the *release* date is muddled by that concurrency (32%
negative in the unrestricted run), which is why the recommended lag metric
is application→application, with the concurrent share reported beside it.

## 3. Recommended metric definitions

- **Population:** released DPs among the *currently filtered* detail rows
  (so category/search filters flow through), applied ≥ the BP dataset's
  first year.
- **Join key set:** `{address} ∪ split(locationaddresses,';')`, each
  uppercased, whitespace-collapsed, leading `#unit ` stripped.
- **Followed:** ≥1 BP whose `applieddate` ≥ the DP's `applieddate` at any
  key. **Headline: followed within 3 years** (52.4% in the sample), with
  the any-time share as a secondary figure — the bounded window keeps
  unrelated later permits out of the headline claim.
- **Lag:** median days, DP application → first BP application; plus the
  share of first BPs applied before the DP decision ("applied in
  parallel").
- **Category breakdown:** followed-% for the top ~6 categories in scope
  (min-n gate ≈ 20, the choropleth idiom).

## 4. UI shape

A new **"Application → construction"** card in DP mode only, using the
renovation card's locked-overlay idiom in reverse: visible under
Development, overlay-locked until a community is drilled ("Drill into a
community to trace its approvals into construction permits"), hidden
entirely under Building. Contents: three stat lines (followed-within-3y +
any-time · median lag + parallel share · n matched over n eligible) and a
small per-category HTML bar list (no new canvas — avoids chart-rebuild
wiring; plain divs styled like the legend/insight rows). One About
paragraph and the same-parcel caveat.

Community-drilled only, deliberately: the BP fetch must span the
community's *entire* history so follow-ups aren't truncated by the year
filter, which is only bounded (≤30K rows) within one community. A
year-only detail scope keeps the overlay.

## 5. Architecture

- `soql(params, signal, api)` gains an optional third argument (default
  `D.ds.api`) — the one cross-dataset request in the app.
- Fetch: `select originaladdress,applieddate where communityname='…'
  limit 30000` against `c2es-76ed` — two fields keeps the largest payload
  ~1 MB (biggest BP community today: Downtown Commercial Core ≈ 14.6K
  rows, 2× headroom under the cap; cap disclosed in the card if ever hit).
- Cache: a session `Map` keyed by community name; the parcel index (key →
  sorted applied dates) is built once per community. Recompute of the
  stats runs in `showDetail()` over the current filtered rows — O(rows)
  against the cached index, so search/filter changes are instant and
  race-free (no new request paths beyond the one guarded fetch).
- Registry: `DATASETS.dp` gains the pipeline flag/copy; `bp` untouched.
  No URL state (derived view), no CSP change (same host),
  `DETAIL_THRESHOLD` untouched.

## 6. Testing

- **Harness:** one new stub branch for the cross-dataset fetch (route on
  `sel.startsWith('originaladdress')` inside the c2es-76ed branch set),
  returning crafted rows that exercise: `#unit `-prefix stripping,
  multi-parcel `locationaddresses` expansion, a BP *before* the DP
  application (must not count), an unmatched parcel, and a
  concurrent-with-decision BP. Assertions: exact join counts and lag
  median; population excludes pre-BP-era DPs; card states (hidden in bp,
  locked in dp city and year-only detail, live in community detail);
  cache hit on a second drill (no refetch); stats recompute under a
  search filter. Existing 172 checks unchanged.
- **Smoke:** no new SoQL shapes (plain select/where/limit) — unchanged.
- **Live verification:** spot-check against the numbers above (Beltline
  82.0% any-time / Altadore concurrency / the 62.3% ≥1999 aggregate).

## 7. Risks and decisions

1. **Same parcel ≠ same project.** A suite DP followed by an unrelated
   deck BP still counts. Mitigations: the 3-year headline window, honest
   labeling ("followed by a building permit at the same parcel"), and the
   category breakdown, which carries the real signal.
2. **Unit vs. parcel granularity.** The parcel key merges a whole tower
   downtown, so any tenant-improvement BP matches a building-wide DP
   (n0→n1 delta is only +1.8 pp on match rate, but follow-up overcount is
   real in Beltline/DCC). Ship v1 parcel-level with the caveat; an
   exact-unit-first tiebreak is later polish.
3. **BP-data floor (1999).** Restrict the population and say so (§2) —
   the single correctness decision this scoping run surfaced.
4. **30K cap / payload** — disclosed cap, 2-field select (§5).
5. **Interpretation.** This measures *observed same-parcel construction
   applications*, not causally "this DP's building permit". The About
   wording must stay descriptive.

## 8. Add-on candidates (from the task notes)

- **Decision outcomes by year** (stacked Approval/Refusal bars): cheap —
  per-year `appr`/`refn` can join the existing `cityYr` select (zero extra
  requests) and the card fills the grid slot the hidden cost-distribution
  card leaves empty in DP mode. Recommended: **in**, as an optional
  stretch decided at implementation.
- **Multipoint rendering** for `locationcount`>1: **out** — map polish
  with little analytical value; the join already consumes
  `locationaddresses`, which was the useful part.

## 9. Phasing

| Phase | Content | Size |
|---|---|---|
| 1 | Card + join + cache + copy; harness branch + assertions; live verification; dist rebuild | ~1 session |
| stretch | Decision-outcomes-by-year card (zero-request) | folds in if time allows |

## 10. Open questions (owner)

1. Headline window — recommended: followed **within 3 years**, any-time as
   the secondary figure.
2. Category bars — recommended: plain HTML rows, not a new Chart.js
   canvas.
3. Stretch chart in or out of the implementation session.
