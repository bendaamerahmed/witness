'use strict';
// Relative links in the docs are load-bearing (the README is the product page).
// A dead one ships as a 404 on the busiest file in the repo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const DOCS = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'docs/SPEC.md', 'docs/TELLS.md',
  'docs/CI.md', 'docs/PUBLISHING.md', 'docs/ROADMAP.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md', 'benchmarks/README.md', 'benchmarks/results/2026-08-06-first-run.md', 'benchmarks/results/2026-08-06-wild-sweep.md', 'examples/README.md'];

let failed = false;
for (const doc of DOCS) {
  const p = path.join(ROOT, doc);
  if (!fs.existsSync(p)) { console.error(`missing doc: ${doc}`); failed = true; continue; }
  const text = fs.readFileSync(p, 'utf8');
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    const target = path.resolve(path.dirname(p), href.split('#')[0]);
    if (!fs.existsSync(target)) { console.error(`${doc}: broken link -> ${href}`); failed = true; }
  }
}

// The published handle must never drift back to a placeholder.
const OWNER = 'bendaamerahmed';
for (const f of ['README.md', 'package.json', '.claude-plugin/marketplace.json', '.codex-plugin/plugin.json', 'lib/sarif.js']) {
  const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (/ahmedbendaamer|YOUR-GITHUB|<owner>/i.test(t)) { console.error(`${f}: placeholder handle still present`); failed = true; }
  if (f !== 'package.json' && !t.includes(OWNER)) { console.error(`${f}: does not reference ${OWNER}`); failed = true; }
}

if (failed) process.exit(1);
console.log(`Links resolve across ${DOCS.length} docs; owner handle consistent.`);
