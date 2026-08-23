# permit-explorer — Audit (2026-07)

**Dimensions run:** correctness and data-metric integrity; security and provenance; maintainability and dependency/supply-chain hygiene; JavaScript and Python conventions; test/CI coverage; and live deployment, responsive layout, accessibility, and SEO behavior. Regulatory defensibility, financial-data correctness, statistical-estimator validity, and citation/methods integrity were not applicable to this public open-data viewer.

**Baseline:** the audit branch was created from local `main` at `d17ade7`, with pre-existing uncommitted changes to `src/m0_validate.py` and an untracked `src/blank.py`. That local branch was two commits behind `origin/main` (`da5abb1`); the two remote commits change the canonical domain and collapse the category grid into a dropdown. Their diff and the live deployment were inspected, but file/line references below use the current checkout. The live site serves the remote UI at both `https://krevian.com/` and `https://yyc-permits.krevian.com/`.

## Summary

The core explorer is thoughtfully built and generally healthy: the source and committed deploy output are byte-identical after a clean build, the 83-assertion offline harness and six-check live API contract test pass, the production app loads cleanly, its security headers are deployed, and no secret, prompt-injection, or provenance anomaly was found. There are **no critical findings**. Four issues deserve priority: average project cost silently treats missing estimates as zero; failed comparison requests silently become zero-valued communities; the production page overflows horizontally on a phone-sized viewport; and the local working tree currently replaces the newly committed data validator with an unrelated three-line snippet. The first two can present wrong data without warning.

## Critical

_None._

## Major

- **“Avg project cost” silently imputes every missing estimate as $0.** The head query returns `count(1)` and `sum(estprojectcost)` (`src/city_explorer.html:763`), then the KPI renders `sum / count` (`src/city_explorer.html:900-902`). The same denominator is used for the cost choropleth (`src/city_explorer.html:564`, `:784`, `:796`) and community comparison (`src/city_explorer.html:1131`, `:1139-1140`). Socrata's `sum` ignores NULL while `count(1)` includes it. The live dataset currently has 495,661 permits but only 457,606 non-null cost values: the app computes $251,253.96 while `avg(estprojectcost)` is $272,148.50, a 7.68% understatement. This conflicts with the page's own disclosure that some permits have no cost. **Fix:** request `avg(estprojectcost) as avgc` (and preferably `count(estprojectcost) as costn`) in head/community/comparison queries; use `avgc` for average KPIs and shading while retaining `sum` for totals; disclose the cost-value coverage.

- **A failed comparison query is rendered as a real community with zero permits and $0 cost.** Each per-community request catches every non-abort failure and returns `null` (`src/city_explorer.html:1130-1133`). The following mapping turns `null` into an empty row set and reduces it to all zeros (`src/city_explorer.html:1136-1142`), so HTTP 429/5xx/network/schema failures can silently make a community look inactive and distort every “best” highlight. The outer error handler never sees these failures. **Fix:** preserve an explicit per-community `{data,error}` result, exclude failed communities from rankings/charts, and show a named retry/error state; add a partial-failure harness case.

- **The live page has document-level horizontal overflow on mobile.** The responsive rule collapses grids to `grid-template-columns:1fr` (`src/city_explorer.html:191-194`, `:274-282`), but grid items keep their intrinsic Chart.js canvas width. At a 390×844 browser viewport (375 CSS-pixel document width after browser chrome), the live page's `body.scrollWidth` was 607 px; `.grid.two` expanded to 593 px and `.grid.three` to 387 px, producing a persistent bottom scrollbar and off-screen cards. **Fix:** use `minmax(0,1fr)` for collapsed grid columns and/or `min-width:0` on `.grid > .card`/chart containers; add a browser test at 390 px asserting `document.documentElement.scrollWidth <= clientWidth`.

- **The pre-existing working-tree edit deletes the M0 validator.** `src/m0_validate.py:1-3` now contains only a string-slicing exercise, replacing the committed 200-line Socrata validation program; `src/blank.py` is also an untracked empty file. If committed, `python src/m0_validate.py` would no longer validate any dataset. This is local-only and does not affect the deployed site, but it is a complete functional regression in the audited tree. **Fix:** decide whether this scratch work belongs elsewhere, then restore or intentionally remove the validator before committing; keep the unrelated exercise outside `src/`.

## Minor

- **Both the old and new domains serve the same app with HTTP 200, but the HTML declares no canonical URL.** Production `robots.txt` and the sitemap point to `https://yyc-permits.krevian.com/`, while `https://krevian.com/` still serves the identical page instead of redirecting; the `<head>` has no `rel="canonical"` (`src/city_explorer.html:3-15`). This can split indexing/link signals and explains why the old URL still appears canonical to users. **Fix:** configure a permanent Cloudflare redirect from the old hostname to the subdomain (preferred), or add a canonical link and keep sitemap/robots/README consistent.

- **The processing-speed chart changes statistic without changing its label.** The card and canvas always say “avg”/“Average” (`src/city_explorer.html:445-448`), but detail mode plots yearly medians (`src/city_explorer.html:845-850`, `:920`) while city mode plots server means (`src/city_explorer.html:778`, `:792`). **Fix:** update the visible hint, accessible label, and tooltip when the mode changes, or use the same statistic in both modes.

- **Negative days-to-issue are handled inconsistently.** City queries average raw `date_diff_d` values (`src/city_explorer.html:763`, `:778`, `:784`), while detail mode clamps negatives to zero (`src/city_explorer.html:815`). The live data currently has one such record at −6 days, so the impact is small but active. **Fix:** define one documented rule—prefer excluding invalid negative durations from both modes—and test it.

- **Completion-rate denominators diverge if status is NULL.** The KPI status query excludes NULL (`src/city_explorer.html:783`, `:909-912`), while the choropleth and comparison use `count(1) - open` (`src/city_explorer.html:784`, `:796`, `:1138-1140`), which includes NULL in the resolved denominator. The live dataset currently has zero NULL statuses, so this is latent. **Fix:** calculate explicit non-null resolved counts everywhere from the same expression.

- **The city “% new construction” note depends on a top-eight result.** Work classes are truncated to eight (`src/city_explorer.html:780`), then the KPI searches that truncated array for `New` (`src/city_explorer.html:906-907`). A filtered slice where `New` ranks ninth displays a blank note rather than the real percentage. **Fix:** add a dedicated `New` aggregate or return all work classes for this calculation.

- **Public copy still describes map bubbles that no longer exist.** The hero says every “map bubble” updates and the About panel says bubbles use average community locations (`src/city_explorer.html:314`, `:339`), while city mode has been always-choropleth since June and the live map confirms that. **Fix:** describe shaded community areas in city mode and permit points in detail mode.

- **CSV exports do not neutralize spreadsheet formulas.** `csvCell()` only applies RFC-style quoting (`src/city_explorer.html:1303-1313`); applicant-controlled descriptions, addresses, or contractor names beginning with `=`, `+`, `-`, or `@` remain executable formulas when opened in Excel/Sheets. **Fix:** prefix formula-looking text fields with a single quote or tab before CSV quoting, and test hostile cells.

- **Third-party scripts/styles have no Subresource Integrity.** Chart.js and Leaflet are version-addressed but loaded from CDNs without `integrity`/`crossorigin` (`src/city_explorer.html:12-15`), and the CSP permits scripts from both CDNs plus inline script execution (`_headers:9`). A CDN compromise would execute in the app origin. **Fix:** self-host these small assets or add verified SRI hashes; longer term, move inline handlers/script into a self-hosted file so `'unsafe-inline'` can be removed.

- **CI hardening is inconsistent.** The smoke workflow declares `permissions: contents: read`, but the main CI workflow has no explicit token permissions and all actions use mutable major tags (`.github/workflows/ci.yml:1-29`, `.github/workflows/smoke.yml:14-26`). **Fix:** add `permissions: contents: read`, pin actions to full commit SHAs with version comments, and enable Dependabot updates for GitHub Actions.

- **Committed deploy output can drift without failing CI.** CI runs `python build.py` and then tests source (`.github/workflows/ci.yml:20-29`), but never runs `git diff --exit-code -- dist/`; a PR can therefore omit a changed `dist/index.html` even though the README treats `dist/` as a committed fallback. The current files are synchronized. **Fix:** add an explicit post-build drift check.

- **The harness misses the three highest-value regression cases found here.** Its aggregate stubs always provide cost totals without missing-value coverage, comparison requests never fail, and it has no layout engine or responsive assertion (`test/city_harness.js:23-68`). It also dereferences the inline-script regex match without a guard (`test/city_harness.js:72-75`). **Fix:** add cost-null/`avgc` assertions, partial comparison failures, a small real-browser mobile smoke test, and a clear extraction failure message.

## Verification

- `python build.py` passed; rebuilt `dist/index.html`, `_headers`, `sitemap.xml`, and `robots.txt` produced no tracked diff. `src/city_explorer.html` and `dist/index.html` have the same SHA-256.
- Offline harness: **83 passed, 0 failed** using the bundled Node runtime.
- Live API smoke test: **6 passed, 0 failed** against `c2es-76ed` (all 16 fields, row count, SoQL aggregates/binning, and CSV endpoint).
- Production desktop load: 495,661 permits, 16/16 categories, 318 community options, no visible/runtime error, and no captured console warnings/errors.
- Production headers confirmed: CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, Referrer-Policy, and Permissions-Policy.
- `pi_audit.py`: eight MEDIUM candidates, all benign uses of “silent/silently” in comments, tracker notes, and the previous audit. No override payload, exfiltration payload, invisible Unicode, HTML-comment injection, or secret was found. Git integrity passed.
- Provenance: expected owner/GitHub author-committer pairs and documented Claude co-author trailers only; no unfamiliar author/committer split.

## Could not verify

- The GitHub connector returned no legacy commit-status contexts or PR-triggered workflow-run entries for `origin/main` at `da5abb1`, so the latest hosted Actions result could not be independently confirmed through that interface. Local deterministic tests, the live API contract test, and the production runtime checks all passed.
- Cloudflare account-level redirect/project configuration was not available. The externally observable result—both hostnames return HTTP 200 while robots/sitemap name the subdomain—is confirmed.
- The intended runtime behavior of `src/m0_validate.py` could not be exercised from the audited working tree because the pre-existing local edit removed the validator. Its committed version remains recoverable from Git.
