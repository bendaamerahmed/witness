#!/usr/bin/env node
'use strict';
/**
 * Turn a witness JSON report into GitHub Action outputs.
 *
 *   node scripts/action-outputs.js witness.json >> "$GITHUB_OUTPUT"
 *
 * This exists because it used to be two `node -e` one-liners inline in
 * action.yml, and they read `report.findings.length` — which was correct until
 * 0.3.0 turned `findings` from an array into a count. `(0).length` is
 * `undefined`, so every run printed "**undefined finding(s)**" and never took
 * the clean branch. Nothing failed; the summary just quietly lied, in the one
 * repository whose entire subject is output that quietly lies.
 *
 * Inline shell in a YAML string is not covered by any test. This file is, in
 * tests/contract.test.js, against a report produced by the real renderer — so
 * the next schema change breaks a test instead of a job summary.
 *
 * Missing or unparseable input is reported as zero findings with a note on
 * stderr, because a scan that could not run must not be presented as a clean
 * scan, and must not fail the job either.
 */
const fs = require('fs');

function outputs(report) {
  const r = report && typeof report === 'object' ? report : {};
  const findings = Number.isFinite(r.findings) ? r.findings : 0;
  const issues = Number.isFinite(r.issues) ? r.issues : findings;
  const tells = Array.isArray(r.tells) ? r.tells : [];
  return {
    findings: String(findings),
    issues: String(issues),
    tells: tells.join(','),
    // A single word the summary step can branch on without re-parsing numbers.
    status: findings > 0 ? 'findings' : 'clean',
  };
}

function main() {
  const file = process.argv[2] || 'witness.json';
  let report = null;
  try {
    report = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    process.stderr.write(`witness: could not read ${file} (${e.message}); reporting 0 findings\n`);
  }
  const o = outputs(report);
  for (const [k, v] of Object.entries(o)) process.stdout.write(`${k}=${v}\n`);
}

if (require.main === module) main();
module.exports = { outputs };
