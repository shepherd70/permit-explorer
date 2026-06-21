// Drift guard for the two intentionally-duplicated dashboards. Run: node test/drift.js
//
// src/city_explorer.html (live, no build step) and src/template.html (offline,
// built by build.py) share a set of pure helpers/constants by COPY — true
// single-sourcing is impossible because the live file must stay directly
// openable with no build. So those copies silently drift, which the 2026-06
// audit found (fmt$ had grown a $B tier and an isNaN guard in the live app but
// not the offline one). This test treats the live file as the source of truth:
// it extracts each shared definition from city_explorer.html and asserts the
// byte-identical line exists in template.html. Exits non-zero on any divergence.
'use strict';
const fs = require('fs'), path = require('path');

let failures = 0, passes = 0;
function check(name, cond, got) {
  if (cond) { passes++; console.log('  PASS', name); }
  else { failures++; console.error('  FAIL', name, got !== undefined ? ('\n        ' + got) : ''); }
}

const root = path.join(__dirname, '..', 'src');
const live = fs.readFileSync(path.join(root, 'city_explorer.html'), 'utf8');
const offline = fs.readFileSync(path.join(root, 'template.html'), 'utf8');

// Single-line `const <name> = ...;` definitions that MUST match between the two
// files. (COLORS is intentionally NOT shared — the live app builds it from an
// Okabe-Ito palette object, the offline one uses a raw hex array.)
const SHARED = ['MONTHS', 'STATUS_COLORS', 'COST_BINS', 'DTI_BINS', 'fmt$', 'fmtN', 'median', 'binCounts', 'esc'];
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

for (const name of SHARED) {
  const m = live.match(new RegExp('^\\s*(const ' + reEsc(name) + '\\s*=.*)$', 'm'));
  if (!m) { check(`${name} present in live source`, false, `could not find \`const ${name}\` in src/city_explorer.html — update test/drift.js`); continue; }
  const canon = m[1].trim();
  check(`${name} identical in offline template`, offline.includes(canon),
    `src/template.html is missing the live definition:\n        ${canon}`);
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
