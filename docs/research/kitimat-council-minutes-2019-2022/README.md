# Kitimat council minutes 2019–2022 — first-pass planning-decision extraction

**Status:** research material for tracker task #40 (not verified, not used by the app).
**Extracted:** 2026-09-02 from 82 of the 87 regular-meeting minutes for 2019–2022
(418 pages). Five meetings — 2019-10-07, 2020-06-01, 2021-02-01, 2021-02-16,
2022-04-19 — were never captured by the Wayback Machine and are missing.

## Where the minutes came from

The District's old site (`kitimat.ca/en/...`) was replaced in 2026 and its PDFs now
404. The old **Archive of Minutes** page survives in the Wayback Machine
(`web.archive.org/web/2026id_/https://www.kitimat.ca/en/municipal-hall/archive-of-minutes.aspx`,
2016–2021 links) and the archived **Agendas and Minutes** page (2022–2024 links).
Each PDF was fetched as `https://web.archive.org/web/2026id_/https://www.kitimat.ca<path>`;
`minutes-urls.txt` lists the 87 paths. 2023–2024 minutes are listed on the same
archived page; 2025–2026 minutes live on `kitimat-docs.simplicitycms.ca/docs/minutes-<mon>-<d>-<yyyy>.pdf`
and 2026 agenda packages on `docs.kitimat.ca/docs/<yyyy-mm-dd>-reg.pdf`.

## What the minutes contain

No building-permit issuance data (the building department did not report to
council in this period). They do contain every **development variance permit,
development permit, temporary use permit, zoning amendment and OCP amendment**
that came before council: agenda-item title with applicant and address, the
motion, the outcome (Carried / Defeated / Referred to the Advisory Planning
Commission / Tabled) and the resolution number (`R20-071`).

## Files

- `kitimat_council_applications_2019_2022.csv` — one row per DVP / DP / TUP
  application (64 rows): type, address, title, first and last council date,
  number of council appearances, days between them, outcome, resolution numbers.
- `kitimat_council_planning_2019_2022.csv` — the flatter table (83 rows): every
  application row plus one row per bylaw (zoning / OCP / housing agreement)
  keyed by bylaw number, with the number of readings seen.

| Year | DVP | DP | TUP | Zoning bylaws | OCP bylaws | Approved | Refused |
|---|---|---|---|---|---|---|---|
| 2019 | 5 | 5 | 5 | 1 | 5 | 6 | 0 |
| 2020 | 11 | 4 | 8 | 9 | 0 | 12 | 1 |
| 2021 | 4 | 3 | 2 | 3 | 1 | 8 | 0 |
| 2022 | 7 | 9 | 1 | 1 | 1 | 12 | 0 |

## Known limits of this pass

- Regex extraction over four years of changing minute templates: 33 of 64
  applications carry a clean civic address, 60 carry a resolution number.
- 25 applications show no final vote because the decision appeared at a later
  meeting under a heading the grouping did not merge; the true approval rate is
  higher than the table shows. Hand-check those before using the outcomes.
- Bylaw rows keep the last meeting seen (adoption or defeat) and count readings.
- The five missing meetings may hold further items.
