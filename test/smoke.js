// Live-API smoke test for the city-wide explorer. Run: node test/smoke.js
//
// src/city_explorer.html talks directly to Calgary's open-data (Socrata)
// endpoints — one per entry in its DATASETS registry (building permits
// c2es-76ed, development permits 6933-unw5). The offline harness
// (test/city_harness.js) only asserts against canned responses, so a schema,
// field, function, or endpoint change at Calgary would break the live site
// SILENTLY. This test hits the REAL endpoints and verifies that every field
// and SoQL feature the explorer depends on still works, dataset by dataset
// (sequentially, to stay rate-limit-friendly).
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
// We test exactly what the live page uses, read straight from its source, so
// this can't silently drift from the app. Each DATASETS entry declares, in
// source order, api:'…' then fields:'…' then head:"…" (the registry's
// documented key-order contract); the triple regex below pairs them up.
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'city_explorer.html'), 'utf8');
const DS_RE = /api:'([^']+)'[\s\S]*?fields:'([^']+)'[\s\S]*?head:"([^"]+)"/g;
const DATASETS = [...html.matchAll(DS_RE)].map(m => {
  const resolved = (m[3].match(/date_diff_d\((\w+),applieddate\)/) || [])[1];   // issueddate / decisiondate
  return {
    id: (m[1].match(/resource\/([a-z0-9-]+)\.json/) || [, m[1]])[1],
    api: m[1],
    fields: m[2].split(',').map(s => s.trim()).filter(Boolean),
    head: m[3],
    resolved,
  };
});
if (DATASETS.length < 2) { console.error(`FAIL expected at least 2 datasets in the DATASETS registry, extracted ${DATASETS.length} — test needs updating`); process.exit(1); }
if (DATASETS.some(d => !d.resolved)) { console.error('FAIL could not extract a date_diff_d(<resolved>,applieddate) expression from every head query — test needs updating'); process.exit(1); }
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
async function rows(base, params) {
  const { ok, status, body } = await httpGet(url(base, params));
  if (!ok) throw new Error(`HTTP ${status}: ${body.slice(0, 200)}`);
  let data; try { data = JSON.parse(body); } catch (e) { throw new Error('non-JSON response: ' + body.slice(0, 120)); }
  if (!Array.isArray(data)) throw new Error('expected JSON array, got: ' + body.slice(0, 120));
  return data;
}

// --- the checks, per dataset: each mirrors a query the live explorer issues ---
function checksFor(ds) {
  const API = ds.api, CSV_API = ds.api.replace(/\.json$/, '.csv'), FIELDS = ds.fields;
  const tag = s => `[${ds.id}] ${s}`;
  return [

    // 1. Every field the page selects still exists and is queryable. A renamed
    //    or dropped column makes Socrata 400; on failure we probe each field so
    //    the report names exactly which one(s) broke.
    { name: tag(`all ${FIELDS.length} fields selectable`), fn: async (name) => {
      const { ok, status, body } = await httpGet(url(API, { select: FIELDS.join(','), limit: '1' }));
      if (ok) {
        const data = JSON.parse(body);
        check(name, Array.isArray(data) && data.length >= 1, Array.isArray(data) ? data.length : body.slice(0, 120));
        return;
      }
      const bad = [];
      for (const f of FIELDS) { const r = await httpGet(url(API, { select: f, limit: '1' })); if (!r.ok) bad.push(f); }
      check(name, false, { status, unknownFields: bad, apiBody: body.slice(0, 160) });
    } },

    // 2. Dataset is intact (catches a catastrophic swap/truncation/emptying).
    //    Both datasets are far larger; floor well below to avoid false alarms.
    { name: tag('dataset row count plausible (>100k)'), fn: async (name) => {
      const r = await rows(API, { select: 'count(1) as n' });
      const n = r[0] && +r[0].n;
      check(name, Number.isFinite(n) && n > 100000, n);
    } },

    // 3. Year histogram — date_extract_y + count + group + order (loadOptions()).
    { name: tag('date_extract_y year histogram'), fn: async (name) => {
      const r = await rows(API, { select: 'date_extract_y(applieddate) as k, count(1) as n', group: 'k', order: 'k', limit: '5' });
      check(name, r.length >= 1 && r[0].k != null && r[0].n != null, r[0]);
    } },

    // 4. Head KPIs — runs this dataset's head query VERBATIM (extracted from the
    //    registry): the case()-guarded date_diff_d (negative durations excluded)
    //    plus every sum/avg/count aggregate the KPI row depends on. A 200 means
    //    every expression still parses; the conditions confirm each returned
    //    aggregate is a sane number (d = the guarded duration in both datasets).
    { name: tag('head aggregates (verbatim registry head query)'), fn: async (name) => {
      const r = await rows(API, { select: ds.head, limit: '1' });
      const x = r[0] || {};
      const vals = Object.values(x);
      check(name,
        Number.isFinite(+x.n) && +x.n > 100000 && x.d != null && Number.isFinite(+x.d) && +x.d > 0
          && vals.length >= 5 && vals.every(v => v == null || Number.isFinite(+v)),
        x);
    } },

    // 5. case() binning on this dataset's processing-time expression — the
    //    days-to-issue / days-to-decision distribution query shape.
    { name: tag(`case() bin grouping on date_diff_d(${ds.resolved},applieddate)`), fn: async (name) => {
      const e = `date_diff_d(${ds.resolved},applieddate)`;
      const expr = `case(${e} <= 7,'0', ${e} <= 30,'1', ${e} > 30,'2')`;
      const r = await rows(API, { select: `${expr} as b, count(1) as n`, where: `${ds.resolved} IS NOT NULL`, group: 'b', limit: '10' });
      check(name, r.length >= 1 && r.some(x => x.n != null), r);
    } },

    // 6. CSV export endpoint — the "Export CSV" button hits .csv directly. The
    //    CSV header echoes the selected columns, so it confirms field presence
    //    via the export path too.
    { name: tag('CSV export endpoint + header'), fn: async (name) => {
      const { ok, status, body } = await httpGet(url(CSV_API, { select: FIELDS.join(','), limit: '1' }), { accept: 'text/csv' });
      const header = (body.split(/\r?\n/)[0] || '').toLowerCase().split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      const missing = FIELDS.filter(f => !header.includes(f));
      check(name, ok && missing.length === 0, ok ? { missing } : { status, body: body.slice(0, 160) });
    } },
  ];
}

(async () => {
  for (const ds of DATASETS) {                       // sequential per dataset — rate-limit-friendly
    console.log(`\nLive-API smoke test → ${ds.api}`);
    console.log(`Verifying ${ds.fields.length} fields: ${ds.fields.join(', ')}\n`);
    for (const c of checksFor(ds)) {
      try { await c.fn(c.name); }
      catch (e) { check(c.name, false, 'threw: ' + e.message); }
    }
  }
  console.log(`\n${passes} passed, ${failures} failed.`);
  process.exit(failures ? 1 : 0);
})();
