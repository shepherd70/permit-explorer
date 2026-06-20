// Live-API smoke test for the city-wide explorer. Run: node test/smoke.js
//
// src/city_explorer.html talks directly to Calgary's open-data (Socrata)
// endpoint for dataset c2es-76ed. The offline harnesses (test/harness.js,
// test/city_harness.js) only assert against canned responses, so a schema,
// field, function, or endpoint change at Calgary would break the live site
// SILENTLY. This test hits the REAL endpoint and verifies that every field
// and SoQL feature the explorer depends on still works.
//
// It is intentionally NOT part of `npm test` (which must stay deterministic
// and offline). It runs on a CI cron (.github/workflows/smoke.yml) and on
// demand via `npm run smoke`, and exits non-zero on any failure so the
// scheduled run notifies the repo owner.

'use strict';
const fs = require('fs'), path = require('path');

// --- tiny assertion framework (matches test/city_harness.js) ---
let failures = 0, passes = 0;
function check(name, cond, got) {
  if (cond) { passes++; console.log('  PASS', name); }
  else { failures++; console.error('  FAIL', name, got !== undefined ? ('-> got: ' + JSON.stringify(got)) : ''); }
}

// --- self-extract the contract from the explorer (drift-proof) ---
// We test exactly what the live page uses, read straight from its source,
// so this can't silently drift from the app.
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'city_explorer.html'), 'utf8');
const apiMatch = html.match(/const\s+API\s*=\s*'([^']+)'/);
const fieldsMatch = html.match(/const\s+fields\s*=\s*'([^']+)'/); // detail-mode select: superset of all fields used
if (!apiMatch) { console.error('FAIL could not extract `const API` from src/city_explorer.html — test needs updating'); process.exit(1); }
if (!fieldsMatch) { console.error('FAIL could not extract `const fields` from src/city_explorer.html — test needs updating'); process.exit(1); }
const API = apiMatch[1];
const CSV_API = API.replace(/\.json$/, '.csv'); // export feature hits the .csv endpoint
const FIELDS = fieldsMatch[1].split(',').map(s => s.trim()).filter(Boolean);
const UA = 'permit-explorer-smoke-test (+https://github.com/shepherd70/permit-explorer)';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// HTTP GET with a timeout and retries on TRANSIENT failures only (network
// errors, 429 rate-limit, 5xx). A 4xx like 400 is definitive (e.g. a renamed
// column) and returned immediately — we want those to fail loudly, not retry.
async function httpGet(url, { accept = 'application/json', timeoutMs = 15000, retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ac.signal, headers: { Accept: accept, 'User-Agent': UA } });
      clearTimeout(timer);
      const body = await res.text();
      if ((res.status === 429 || res.status >= 500) && attempt < retries) { await sleep(1000 * attempt); continue; }
      return { ok: res.ok, status: res.status, body };
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt < retries) { await sleep(1000 * attempt); continue; }
    }
  }
  throw new Error(`network error after ${retries} attempts: ${(lastErr && lastErr.message) || lastErr}`);
}

// Build a SoQL URL exactly like the app's soql(): each param keyed as $name.
function url(base, params) {
  const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent('$' + k)}=${encodeURIComponent(v)}`).join('&');
  return `${base}?${qs}`;
}

// GET JSON rows, throwing a descriptive error on any non-200 (so the calling
// check() turns it into a FAIL with the API's own error body).
async function rows(params, base = API) {
  const { ok, status, body } = await httpGet(url(base, params));
  if (!ok) throw new Error(`HTTP ${status}: ${body.slice(0, 200)}`);
  let data; try { data = JSON.parse(body); } catch (e) { throw new Error('non-JSON response: ' + body.slice(0, 120)); }
  if (!Array.isArray(data)) throw new Error('expected JSON array, got: ' + body.slice(0, 120));
  return data;
}

// --- the checks: each mirrors a query the live explorer actually issues ---
const checks = [

  // 1. Every field the page selects still exists and is queryable. A renamed
  //    or dropped column makes Socrata 400; on failure we probe each field so
  //    the report names exactly which one(s) broke.
  { name: `all ${FIELDS.length} fields selectable`, fn: async () => {
    const { ok, status, body } = await httpGet(url(API, { select: FIELDS.join(','), limit: '1' }));
    if (ok) {
      const data = JSON.parse(body);
      check(`all ${FIELDS.length} fields selectable`, Array.isArray(data) && data.length >= 1, Array.isArray(data) ? data.length : body.slice(0, 120));
      return;
    }
    const bad = [];
    for (const f of FIELDS) { const r = await httpGet(url(API, { select: f, limit: '1' })); if (!r.ok) bad.push(f); }
    check(`all ${FIELDS.length} fields selectable`, false, { status, unknownFields: bad, apiBody: body.slice(0, 160) });
  } },

  // 2. Dataset is intact (catches a catastrophic swap/truncation/emptying).
  //    Full set is ~490K; floor well below that to avoid false alarms.
  { name: 'dataset row count plausible (>100k)', fn: async () => {
    const r = await rows({ select: 'count(1) as n' });
    const n = r[0] && +r[0].n;
    check('dataset row count plausible (>100k)', Number.isFinite(n) && n > 100000, n);
  } },

  // 3. Year histogram — date_extract_y + count + group + order (init()).
  { name: 'date_extract_y year histogram', fn: async () => {
    const r = await rows({ select: 'date_extract_y(applieddate) as k, count(1) as n', group: 'k', order: 'k', limit: '5' });
    check('date_extract_y year histogram', r.length >= 1 && r[0].k != null && r[0].n != null, r[0]);
  } },

  // 4. Head KPIs — sum() + avg() + date_diff_d() (enterCity()). A 200 means
  //    those functions still parse; n>0 confirms the aggregate ran.
  { name: 'sum/avg/date_diff_d aggregates', fn: async () => {
    const r = await rows({ select: 'count(1) as n, sum(estprojectcost) as c, sum(housingunits) as u, avg(date_diff_d(issueddate,applieddate)) as d', limit: '1' });
    const n = r[0] && +r[0].n;
    check('sum/avg/date_diff_d aggregates', Number.isFinite(n) && n > 0, r[0]);
  } },

  // 5. case() binning — used for the cost / days-to-issue distributions.
  { name: 'case() bin grouping', fn: async () => {
    const expr = "case(estprojectcost <= 5000,'0', estprojectcost <= 10000,'1', estprojectcost > 10000,'2')";
    const r = await rows({ select: `${expr} as b, count(1) as n`, group: 'b', limit: '10' });
    check('case() bin grouping', r.length >= 1 && r.some(x => x.n != null), r);
  } },

  // 6. CSV export endpoint — the "Export CSV" button hits .csv directly. The
  //    CSV header echoes the selected columns, so it confirms field presence
  //    via the export path too.
  { name: 'CSV export endpoint + header', fn: async () => {
    const { ok, status, body } = await httpGet(url(CSV_API, { select: FIELDS.join(','), limit: '1' }), { accept: 'text/csv' });
    const header = (body.split(/\r?\n/)[0] || '').toLowerCase().split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    const missing = FIELDS.filter(f => !header.includes(f));
    check('CSV export endpoint + header', ok && missing.length === 0, ok ? { missing } : { status, body: body.slice(0, 160) });
  } },
];

(async () => {
  console.log(`Live-API smoke test → ${API}`);
  console.log(`Verifying ${FIELDS.length} fields: ${FIELDS.join(', ')}\n`);
  for (const c of checks) {
    try { await c.fn(); }
    catch (e) { check(c.name, false, 'threw: ' + e.message); }
  }
  console.log(`\n${passes} passed, ${failures} failed.`);
  process.exit(failures ? 1 : 0);
})();
