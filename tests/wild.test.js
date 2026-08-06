'use strict';
/**
 * The wild benchmark is only worth anything if it is reproducible and if its
 * labels stay attached to the findings they describe. Running the sweep itself
 * needs ~200MB of clones, so that runs on its own CI job; these are the checks
 * that must hold on every commit.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pins = JSON.parse(fs.readFileSync(path.join(ROOT, 'benchmarks/wild-pins.json'), 'utf8'));
const labels = JSON.parse(fs.readFileSync(path.join(ROOT, 'benchmarks/wild-labels.json'), 'utf8'));
const { REPOS } = require('../benchmarks/wild');
const { ALL_TELLS } = require('../hooks/witness-detect');

test('every repository in the sweep is pinned to a full commit sha', () => {
  for (const r of REPOS) {
    assert.match(String(pins.heads[r.name] || ''), /^[0-9a-f]{40}$/,
      `${r.name} has no pin, so its numbers would drift with upstream`);
  }
});

test('every label is keyed repo|sha|tell|path|line and names a real repo and tell', () => {
  const repos = new Set(REPOS.map((r) => r.name));
  const keys = Object.keys(labels.labels);
  assert.ok(keys.length > 20, 'suspiciously few labels');
  for (const k of keys) {
    const parts = k.split('|');
    assert.strictEqual(parts.length, 5, `malformed key: ${k}`);
    const [repo, sha, tell, , line] = parts;
    assert.ok(repos.has(repo), `unknown repo in key: ${k}`);
    assert.match(sha, /^[0-9a-f]{10}$/, `key sha must be the 10-char short sha: ${k}`);
    assert.ok(ALL_TELLS.includes(tell), `unknown tell in key: ${k}`);
    assert.match(line, /^\d+$/, `key line must be numeric: ${k}`);
  }
});

test('every verdict is tp or fp and carries a reason', () => {
  for (const [k, v] of Object.entries(labels.labels)) {
    assert.ok(['tp', 'fp'].includes(v.verdict), `${k}: verdict must be tp or fp`);
    assert.ok(String(v.why || '').length > 20, `${k}: a verdict without a reason is not a label`);
  }
});

test('the false positives are stated, not buried', () => {
  const fp = Object.values(labels.labels).filter((v) => v.verdict === 'fp');
  assert.ok(fp.length > 0,
    'a wild sweep with zero false positives means the labels are being graded generously');
});

test('the scorer refuses to invent a recall number', () => {
  const src = fs.readFileSync(path.join(ROOT, 'benchmarks/wild-precision.js'), 'utf8');
  assert.match(src, /recall/i);
  assert.match(src, /not computable/i);
});
