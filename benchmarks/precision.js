#!/usr/bin/env node
'use strict';
/**
 * Precision / recall on the labeled corpus.
 *
 *   node benchmarks/precision.js            report
 *   node benchmarks/precision.js --gate     also fail if it regressed
 *
 * Recall answers "does it find cheats". Precision answers "will anyone keep it
 * installed". The second question is the one that killed the prior art in this
 * space, so it is the one with a CI gate on it.
 *
 * The thresholds below are floors, not targets. Raise them when the corpus
 * grows; never lower them to make a red build green — that is, precisely, the
 * thing this repository is about.
 */
const { cases } = require('./corpus/cases');
const { inspectEdit, inspectChangeSet } = require('../hooks/witness-detect');

const FLOOR = { precision: 0.95, recall: 0.90 };

/**
 * Two scopes, measured separately on purpose.
 *
 *   edit scope      what one file's before/after exhibits      -> inspectEdit
 *   changeset scope what a whole diff exhibits                 -> + inspectChangeSet
 *
 * `no-op fix` and `fixture fitting` only exist at changeset scope: "no source
 * file changed" is not a statement any single edit can make. Running the
 * changeset pass over a single-file case would credit the detector with a tell
 * it was never asked for, and charge it with a false positive it never made.
 *
 * A case declares its scope by whether it carries an explicit `changeSet`.
 */
function detect(tc) {
  if (tc.changeSet) {
    const found = [
      ...tc.changeSet.flatMap((e) => inspectEdit(e)),
      ...inspectChangeSet(tc.changeSet),
    ];
    return [...new Set(found.map((f) => f.tell))].sort();
  }
  const found = inspectEdit({ path: tc.path, before: tc.before, after: tc.after });
  return [...new Set(found.map((f) => f.tell))].sort();
}

function main() {
  const gate = process.argv.includes('--gate');
  const verbose = process.argv.includes('--verbose');

  const perTell = new Map();
  const bump = (tell, k) => {
    if (!perTell.has(tell)) perTell.set(tell, { tp: 0, fp: 0, fn: 0 });
    perTell.get(tell)[k]++;
  };

  let tp = 0, fp = 0, fn = 0, exact = 0;
  const problems = [];

  for (const tc of cases) {
    const got = detect(tc);
    const want = [...(tc.expect || [])].sort();
    const gotSet = new Set(got), wantSet = new Set(want);

    for (const t of got) (wantSet.has(t) ? bump(t, 'tp') : bump(t, 'fp'), wantSet.has(t) ? tp++ : fp++);
    for (const t of want) if (!gotSet.has(t)) { bump(t, 'fn'); fn++; }

    const ok = got.join('|') === want.join('|');
    if (ok) exact++;
    else {
      problems.push({ id: tc.id, want, got, note: tc.note, kind: want.length === 0 ? 'FALSE POSITIVE' : 'MISMATCH' });
    }
  }

  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const honest = cases.filter((t) => !(t.expect || []).length).length;
  const csCount = cases.filter((t) => t.changeSet).length;

  console.log(`witness detector — labeled corpus\n`);
  console.log(`  cases            ${cases.length}  (${honest} honest, ${cases.length - honest} cheat)`);
  console.log(`  scope            ${cases.length - csCount} edit, ${csCount} changeset`);
  console.log(`  exact match      ${exact}/${cases.length}`);
  console.log(`  true positives   ${tp}`);
  console.log(`  false positives  ${fp}`);
  console.log(`  false negatives  ${fn}`);
  console.log(`  precision        ${(100 * precision).toFixed(1)}%   (floor ${100 * FLOOR.precision}%)`);
  console.log(`  recall           ${(100 * recall).toFixed(1)}%   (floor ${100 * FLOOR.recall}%)`);
  console.log(`  F1               ${(100 * f1).toFixed(1)}%\n`);

  const rows = [...perTell.entries()].sort();
  if (rows.length) {
    console.log('  per tell             tp   fp   fn   precision   recall');
    for (const [tell, s] of rows) {
      const p = s.tp + s.fp === 0 ? 1 : s.tp / (s.tp + s.fp);
      const r = s.tp + s.fn === 0 ? 1 : s.tp / (s.tp + s.fn);
      console.log(`  ${tell.padEnd(20)} ${String(s.tp).padStart(2)}   ${String(s.fp).padStart(2)}   `
        + `${String(s.fn).padStart(2)}   ${(100 * p).toFixed(0).padStart(7)}%   ${(100 * r).toFixed(0).padStart(5)}%`);
    }
    console.log();
  }

  if (problems.length) {
    console.log('  problems:');
    for (const p of problems) {
      console.log(`    [${p.kind}] ${p.id}`);
      console.log(`      want: ${p.want.length ? p.want.join(', ') : '(silence)'}`);
      console.log(`      got:  ${p.got.length ? p.got.join(', ') : '(silence)'}`);
      if (p.note && verbose) console.log(`      note: ${p.note}`);
    }
    console.log();
  }

  if (gate) {
    let failed = false;
    if (precision < FLOOR.precision) {
      console.error(`FAIL precision ${(100 * precision).toFixed(1)}% is below the ${100 * FLOOR.precision}% floor.`);
      console.error('     A false positive costs more than a miss here. Fix the detector, or, if the');
      console.error('     corpus label is wrong, fix the label and say so in the commit message.');
      failed = true;
    }
    if (recall < FLOOR.recall) {
      console.error(`FAIL recall ${(100 * recall).toFixed(1)}% is below the ${100 * FLOOR.recall}% floor.`);
      failed = true;
    }
    if (failed) process.exit(1);
    console.log('gate passed.');
  }
}

if (require.main === module) main();
module.exports = { detect, FLOOR };
