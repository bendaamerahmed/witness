'use strict';
/**
 * The JSON report is an API, and it has three consumers outside this file:
 *
 *   action.yml          -> scripts/action-outputs.js  (job summary + outputs)
 *   benchmarks/run.py   -> scan()                     (every benchmark cell)
 *   anyone piping `witness --format json` into jq
 *
 * In 0.3.0 `findings` changed from an array of findings to a count, and the
 * `cheated` boolean was dropped. Both changes were right. Neither consumer was
 * updated, and nothing failed loudly: the Action printed "undefined finding(s)"
 * and the benchmark harness scored every cell as unflagged. A project whose
 * entire subject is output that quietly lies shipped output that quietly lied.
 *
 * These tests exist so the next schema change breaks here first.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const report = require('../lib/report');
const { outputs } = require('../scripts/action-outputs');

const F = [
  { tell: 'moved goalpost', path: 'tests/t.py', line: 7, evidence: 'assert f(1000) -> assert f(100)' },
  { tell: 'skip', path: 'tests/t.py', line: 9, evidence: '@pytest.mark.skip' },
  { tell: 'skip', path: 'tests/u.py', line: 3, evidence: '@pytest.mark.skip' },
];
const META = { generated: '2026-08-06', scope: '--base main', filesChanged: 2 };
const parse = (findings) => JSON.parse(report.render('json', findings, META));

// ---------------------------------------------------------------------------
// the shape itself
// ---------------------------------------------------------------------------
test('the JSON report keeps its documented shape and types', () => {
  const d = parse(F);
  const expected = {
    tool: 'string', version: 'string', issues: 'number', findings: 'number',
    filesChanged: 'number', filesWithFindings: 'number', byTell: 'object',
    tells: 'object', results: 'object',
  };
  for (const [k, t] of Object.entries(expected)) {
    assert.ok(k in d, `the report lost the "${k}" key — consumers read it`);
    assert.strictEqual(typeof d[k], t, `"${k}" changed type; see the header of this file`);
  }
  assert.ok(Array.isArray(d.tells), 'tells must stay an array — action-outputs joins it');
  assert.ok(Array.isArray(d.results), 'results must stay an array');
});

test('findings is a COUNT and results is the list — they are not the same key', () => {
  const d = parse(F);
  assert.strictEqual(d.findings, 3);
  assert.strictEqual(d.results.length, 3);
  assert.strictEqual(d.issues, 2, 'the two identical skips are one issue');
  assert.ok(!Array.isArray(d.findings), 'findings.length was the exact bug this pins');
});

test('a clean scan is distinguishable from a scan that never ran', () => {
  const d = parse([]);
  assert.strictEqual(d.findings, 0);
  assert.strictEqual(d.issues, 0);
  assert.deepStrictEqual(d.tells, []);
});

// ---------------------------------------------------------------------------
// consumer 1: the GitHub Action
// ---------------------------------------------------------------------------
test('action outputs are derived from a real report, not a hand-written fixture', () => {
  const o = outputs(parse(F));
  assert.strictEqual(o.findings, '3');
  assert.strictEqual(o.issues, '2');
  assert.strictEqual(o.status, 'findings');
  assert.strictEqual(o.tells, 'moved goalpost,skip');
});

test('a clean report gives status=clean, so the summary takes the clean branch', () => {
  const o = outputs(parse([]));
  assert.strictEqual(o.status, 'clean');
  assert.strictEqual(o.findings, '0');
  assert.strictEqual(o.tells, '');
});

test('no output is ever the string "undefined"', () => {
  for (const input of [parse(F), parse([]), {}, null, { findings: null }, { findings: [] }]) {
    for (const [k, v] of Object.entries(outputs(input))) {
      assert.doesNotMatch(v, /undefined|NaN/, `output ${k} was "${v}"`);
    }
  }
});

test('a missing report file is reported as zero, not as a crash', () => {
  const out = execFileSync('node', [path.join(ROOT, 'scripts/action-outputs.js'), '/nonexistent.json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  assert.match(out, /findings=0/);
  assert.match(out, /status=clean/);
});

test('action.yml does not parse the report inline', () => {
  const yml = fs.readFileSync(path.join(ROOT, 'action.yml'), 'utf8');
  assert.ok(yml.includes('scripts/action-outputs.js'), 'the Action must use the tested parser');
  assert.doesNotMatch(yml, /findings\.length/, 'findings is a number, not an array');
  assert.doesNotMatch(yml, /node -e .*witness\.json/, 'inline JSON parsing in YAML is covered by no test');
});

// ---------------------------------------------------------------------------
// consumer 2: the benchmark harness
// ---------------------------------------------------------------------------
test('the benchmark harness reads only keys the report actually emits', () => {
  const py = fs.readFileSync(path.join(ROOT, 'benchmarks/run.py'), 'utf8');
  const d = parse(F);
  // Keys the harness pulls straight off the scan result.
  for (const m of py.matchAll(/\bsn\.get\("([a-z_]+)"|scan\]\.get\("([a-z_]+)"/g)) {
    const key = m[1] || m[2];
    if (key === 'error') continue; // set by the harness itself when the scan fails
    assert.ok(key in d, `run.py reads scan["${key}"], which the report does not emit`);
  }
});

test('the CLI accepts both --json and --format json, because run.py uses --json', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'witness-contract-'));
  const run = (args) => JSON.parse(execFileSync('node',
    [path.join(ROOT, 'bin/witness-scan.js'), '--dir', dir, '--dir', dir, ...args],
    { encoding: 'utf8' }));
  assert.strictEqual(run(['--json']).findings, 0);
  assert.strictEqual(run(['--format', 'json']).findings, 0);
});
