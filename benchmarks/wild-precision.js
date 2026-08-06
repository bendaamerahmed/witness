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
const { SCANNER_DEFAULT, ALL_TELLS } = require('../hooks/witness-detect');
const { group } = require('../lib/report');

const LABELS_FILE = path.join(__dirname, 'wild-labels.json');

// Floors, not targets. Raise them when the labels grow; never lower one to make
// a red build green — that is, precisely, the thing this repository is about.
const FLOOR = { findings: 0.90, issues: 0.75 };

const key = (f) => `${f.repo}|${f.sha}|${f.tell}|${f.path}|${f.line}`;

/**
 * Wilson score interval for a binomial proportion.
 *
 * 29/31 prints as 93.5%, and a reader takes that for a precise number. It is
 * not: the 95% interval runs from roughly 79% to 98%. At the counts this sweep
 * produces, a point estimate on its own is closer to decoration than to a
 * measurement.
 *
 * Wilson rather than the normal approximation, which is actively misleading
 * here: for 0 successes out of 1 the normal interval is [0%, 0%], asserting
 * certainty from a single observation. Two of the seven tells have exactly one
 * labelled finding, so that case is not hypothetical — it is a row in the
 * table below. Wilson stays inside [0, 1] and stays wide when n is small.
 */
function wilson(k, n, z = 1.96) {
  if (!n) return { lo: 0, hi: 1 };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  // At k === n the upper bound is exactly 1 and at k === 0 the lower bound is
  // exactly 0, but the sqrt leaves 0.9999999999999998. Snapping keeps "21 of 21
  // is consistent with 100%" an exact statement rather than one that depends on
  // how the result is later rounded for display.
  const snap = (x) => (Math.abs(x - 1) < 1e-9 ? 1 : Math.abs(x) < 1e-9 ? 0 : x);
  return {
    lo: snap(Math.max(0, (centre - half) / d)),
    hi: snap(Math.min(1, (centre + half) / d)),
  };
}

/**
 * tp/fp per group, including groups with nothing in them.
 *
 * The empty rows are the point. A tell with no wild findings has not been
 * measured in the wild, and leaving it out of the table reads as if it had
 * been and had done fine.
 */
function breakdown(items, groupOf, verdictOf, universe = []) {
  const cells = new Map(universe.map((g) => [g, { tp: 0, fp: 0 }]));
  for (const f of items) {
    const g = groupOf(f);
    if (!cells.has(g)) cells.set(g, { tp: 0, fp: 0 });
    cells.get(g)[verdictOf(f)]++;
  }
  return [...cells.entries()]
    .map(([group, c]) => {
      const n = c.tp + c.fp;
      return { group, n, tp: c.tp, fp: c.fp, precision: n ? c.tp / n : null, ci: wilson(c.tp, n) };
    })
    .sort((a, b) => b.n - a.n || a.group.localeCompare(b.group));
}

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

  const labelled = [...tp, ...fp];
  const langOf = new Map(results.map((r) => [r.repo, r.lang]));

  // Commits scanned per language, so a cell's sample size is visible next to
  // its rate: "Go, 1 finding" means nothing until you also know Go got 27
  // commits of exposure to produce it.
  const scannedByLang = results.reduce((m, r) => {
    m[r.lang] = (m[r.lang] || 0) + r.scanned;
    return m;
  }, {});

  return {
    commitsScanned: scanned,
    findings: findings.length,
    labelled: denomF,
    unlabelled,
    stale,
    tp: tp.length,
    fp: fp.length,
    findingPrecision: denomF ? tp.length / denomF : 0,
    findingCi: wilson(tp.length, denomF),
    issues: denomI,
    issueFp: issueFp.length,
    issuePrecision: denomI ? (denomI - issueFp.length) / denomI : 0,
    issueCi: wilson(denomI - issueFp.length, denomI),
    byTell: breakdown(labelled, (f) => f.tell, verdictOf, SCANNER_DEFAULT),
    byLanguage: breakdown(labelled, (f) => langOf.get(f.repo), verdictOf, Object.keys(scannedByLang)),
    scannedByLang,
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

  const ci = (c) => `[${pct(c.lo)}, ${pct(c.hi)}]`;

  console.log('witness — precision on real merged commits\n');
  console.log(`  commits scanned    ${s.commitsScanned}   (pinned; see benchmarks/wild-pins.json)`);
  console.log(`  findings           ${s.findings}  labelled ${s.labelled}`);
  console.log(`  FINDING precision  ${pct(s.findingPrecision)}   (${s.tp}/${s.labelled})   95% CI ${ci(s.findingCi)}`);
  console.log(`  ISSUE precision    ${pct(s.issuePrecision)}   (${s.issues - s.issueFp}/${s.issues})   95% CI ${ci(s.issueCi)}`);
  console.log('  recall             not computable here — see the header of this file\n');

  const table = (title, rows) => {
    const w = Math.max(20, ...rows.map((r) => r.group.length));
    console.log(`  ${title}`);
    console.log(`  ${'group'.padEnd(w)} ${'n'.padStart(3)} ${'tp'.padStart(3)} ${'fp'.padStart(3)}  ${'precision'.padStart(9)}   95% CI`);
    for (const r of rows) {
      const p = r.precision === null ? '        —' : pct(r.precision).padStart(9);
      const interval = r.n ? ci(r.ci) : 'no wild finding — unmeasured';
      console.log(`  ${r.group.padEnd(w)} ${String(r.n).padStart(3)} ${String(r.tp).padStart(3)} ${String(r.fp).padStart(3)}  ${p}   ${interval}`);
    }
    console.log();
  };

  table('per tell', s.byTell);
  table('per language', s.byLanguage.map((r) => ({ ...r, group: `${r.group} (${s.scannedByLang[r.group] || 0} commits)` })));

  console.log('  Every interval is Wilson at 95%. Where n is 1 the interval spans most of');
  console.log('  the range, which is the honest reading of a single observation: that row');
  console.log('  says the tell is barely tested in the wild, not that it is bad. A row with');
  console.log('  n=0 has never fired on a real commit and is unmeasured rather than perfect.');
  console.log(`  ${ALL_TELLS.length - SCANNER_DEFAULT.length} tell(s) are absent entirely: ${ALL_TELLS.filter((t) => !SCANNER_DEFAULT.includes(t)).join(', ')} —`);
  console.log('  not in the scanner default, so the sweep never ran it.\n');

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
module.exports = { score, wilson, breakdown, FLOOR, LABELS_FILE };
