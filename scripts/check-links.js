'use strict';
// Relative links in the docs are load-bearing (the README is the product page).
// A dead one ships as a 404 on the busiest file in the repo.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const DOCS = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'docs/SPEC.md', 'docs/TELLS.md',
  'docs/CI.md', 'docs/PUBLISHING.md', 'docs/ROADMAP.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md', 'benchmarks/README.md', 'benchmarks/results/2026-08-06-first-run.md', 'benchmarks/results/2026-08-06-wild-sweep.md', 'benchmarks/results/2026-08-07-replication.md', 'benchmarks/results/2026-08-11-widened-sweep.md', 'examples/README.md'];

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

// A documented action ref that resolves to nothing is a broken copy-paste in
// the busiest snippet in the project. README, docs/CI.md (twice) and the release
// preamble all said @v0 for four releases while no v0 ref had ever been pushed,
// so every user following the front page got "unable to resolve action". Links
// were checked; the one reference that is not a link was not.
const REF_SOURCES = [...DOCS, '.github/RELEASE_PREAMBLE.md'];
const refs = new Set();
for (const doc of REF_SOURCES) {
  const p = path.join(ROOT, doc);
  if (!fs.existsSync(p)) continue;
  for (const m of fs.readFileSync(p, 'utf8').matchAll(/bendaamerahmed\/witness@([A-Za-z0-9._-]+)/g)) refs.add(m[1]);
}

const git = (args) => execFileSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let canResolve = true;
try { git(['rev-parse', '--git-dir']); } catch (e) { canResolve = false; }

if (!canResolve) {
  // Loudly, because a check that quietly does nothing is the thing this
  // repository is about.
  console.log(`NOT a git repository: skipped resolving ${refs.size} documented action ref(s).`);
} else {
  for (const ref of [...refs].sort()) {
    try { git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]); }
    catch (e) {
      console.error(`documented action ref does not exist: bendaamerahmed/witness@${ref}`);
      console.error('  every copy-paste of that snippet fails with "unable to resolve action".');
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log(`Links resolve across ${DOCS.length} docs; owner handle consistent; ${refs.size} action ref(s) resolve.`);
