#!/usr/bin/env node
'use strict';
/**
 * Precision on the wild sweep.
 *
 *   node benchmarks/wild-precision.js           report
 *   node benchmarks/wild-precision.js --gate    also fail on regression or drift
 *   node benchmarks/wild-precision.js --json    machine-readable
 *
 * `benchmarks/precision.js` scores the synthetic corpus, where the same person
 * wrote the cases and the detector, so its 100% means "it does what I intended"
 * and nothing more. This scores the same detector against hand-written verdicts
 * on real merged commits from projects that have never heard of it.
 *
 * It reports precision only. Recall in the wild is not computable here: it would
 * mean reading all 171 commits by hand and deciding what witness should have
 * said. Anyone claiming a wild recall number without doing that is guessing.
 *
 * Two denominators, both worth watching:
 *
 *   findings   every line witness annotated
 *   issues     what a reviewer actually confronts after grouping
 *
 * Issue precision is the lower of the two here, and that is expected rather
 * than alarming: the true positives cluster (seventeen sites, one decision)
 * while the false positives are singletons, so grouping compresses the wins
 * more than the losses. Both numbers are published for that reason.
 */
const fs = require('fs');
const path = require('path');
const { sweepRepo, readPins, REPOS, ROOT } = require('./wild');
const { SCANNER_DEFAULT } = require('../hooks/witness-detect');
const { group } = require('../lib/report');

const LABELS_FILE = path.join(__dirname, 'wild-labels.json');

// Floors, not targets. Raise them when the labels grow; never lower one to make
// a red build green — that is, precisely, the thing this repository is about.
const FLOOR = { findings: 0.90, issues: 0.75 };

const key = (f) => `${f.repo}|${f.sha}|${f.tell}|${f.path}|${f.line}`;

function score() {
  const { labels } = JSON.parse(fs.readFileSync(LABELS_FILE, 'utf8'));
  const pins = readPins();

  const results = REPOS
    .map((r) => sweepRepo(r, pins.commitsPerRepo || 40, SCANNER_DEFAULT, pins.heads[r.name]))
    .filter(Boolean);

  const findings = results.flatMap((r) => r.findings);
  const scanned = results.reduce((a, r) => a + r.scanned, 0);

  const verdictOf = (f) => (labels[key(f)] || {}).verdict || null;

  const unlabelled = findings.filter((f) => !verdictOf(f)).map(key);
  const stale = Object.keys(labels).filter((k) => !findings.some((f) => key(f) === k));

  const tp = findings.filter((f) => verdictOf(f) === 'tp');
  const fp = findings.filter((f) => verdictOf(f) === 'fp');

  // An issue is a false positive when every finding under it is one. A group
  // that mixes verdicts counts as a true positive: the reviewer who opens it
  // finds something real, even if a site or two is noise.
  const issues = results.flatMap((r) => group(r.findings));
  const issueFp = issues.filter((g) => {
    const sites = g.sites.map((s) => ({ ...g, path: s.path, line: s.line }));
    const verdicts = sites.map(verdictOf).filter(Boolean);
    return verdicts.length && verdicts.every((v) => v === 'fp');
  });

  const denomF = tp.length + fp.length;
  const denomI = issues.length;

  return {
    commitsScanned: scanned,
    findings: findings.length,
    labelled: denomF,
    unlabelled,
    stale,
    tp: tp.length,
    fp: fp.length,
    findingPrecision: denomF ? tp.length / denomF : 0,
    issues: denomI,
    issueFp: issueFp.length,
    issuePrecision: denomI ? (denomI - issueFp.length) / denomI : 0,
    falsePositives: fp.map((f) => ({ ...f, why: labels[key(f)].why })),
  };
}

function main() {
  const gate = process.argv.includes('--gate');

  if (!fs.existsSync(ROOT)) {
    const msg = 'wild corpus not cloned. Run:  npm run wild:clone';
    if (gate) { console.error(msg); process.exit(2); }
    console.log(`${msg}\n(skipping — this benchmark needs ~200MB of clones)`);
    return;
  }

  const s = score();
  const pct = (x) => `${(100 * x).toFixed(1)}%`;

  if (process.argv.includes('--json')) { console.log(JSON.stringify(s, null, 2)); return; }

  console.log('witness — precision on real merged commits\n');
  console.log(`  commits scanned    ${s.commitsScanned}   (pinned; see benchmarks/wild-pins.json)`);
  console.log(`  findings           ${s.findings}  labelled ${s.labelled}`);
  console.log(`  FINDING precision  ${pct(s.findingPrecision)}   (${s.tp}/${s.labelled})`);
  console.log(`  ISSUE precision    ${pct(s.issuePrecision)}   (${s.issues - s.issueFp}/${s.issues})`);
  console.log('  recall             not computable here — see the header of this file\n');

  if (s.falsePositives.length) {
    console.log('  false positives, kept in the open:\n');
    for (const f of s.falsePositives) {
      console.log(`    [${f.tell}] ${f.repo}/${f.path}:${f.line}  (${f.sha})`);
      console.log(`      ${f.why}\n`);
    }
  }

  const problems = [];
  if (s.unlabelled.length) {
    problems.push(`${s.unlabelled.length} finding(s) have no verdict — the labels are behind the detector:`);
    for (const k of s.unlabelled.slice(0, 12)) problems.push(`    ${k}`);
    if (s.unlabelled.length > 12) problems.push(`    ... and ${s.unlabelled.length - 12} more`);
  }
  if (s.stale.length) {
    problems.push(`${s.stale.length} label(s) describe findings that no longer occur — delete or explain them:`);
    for (const k of s.stale.slice(0, 12)) problems.push(`    ${k}`);
    if (s.stale.length > 12) problems.push(`    ... and ${s.stale.length - 12} more`);
  }
  if (s.findingPrecision < FLOOR.findings) problems.push(`finding precision ${pct(s.findingPrecision)} < floor ${pct(FLOOR.findings)}`);
  if (s.issuePrecision < FLOOR.issues) problems.push(`issue precision ${pct(s.issuePrecision)} < floor ${pct(FLOOR.issues)}`);

  if (problems.length) {
    console.log('  PROBLEMS');
    for (const p of problems) console.log(`    ${p}`);
    console.log();
    if (gate) process.exit(1);
  } else if (gate) {
    console.log(`  gate passed (floors: findings ${pct(FLOOR.findings)}, issues ${pct(FLOOR.issues)})`);
  }
}

if (require.main === module) main();
module.exports = { score, FLOOR, LABELS_FILE };
