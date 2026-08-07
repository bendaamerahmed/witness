'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { toSarif, RULES, uriFor } = require('../lib/sarif');
const { ASK, ALL_TELLS } = require('../hooks/witness-detect');

const sample = [
  { tell: 'moved goalpost', path: 'tests/test_fmt.py', line: 7, evidence: 'a -> b' },
  { tell: 'suppression', path: 'src\\win\\a.py', line: 3, evidence: '# noqa' },
];

test('emits a structurally valid SARIF 2.1.0 document', () => {
  const d = toSarif(sample);
  assert.strictEqual(d.version, '2.1.0');
  assert.ok(d.$schema.includes('sarif-schema-2.1.0'));
  assert.strictEqual(d.runs.length, 1);
  const run = d.runs[0];
  assert.strictEqual(run.tool.driver.name, 'witness');
  assert.match(run.tool.driver.semanticVersion, /^\d+\.\d+\.\d+$/);
  assert.strictEqual(run.results.length, 2);
});

test('every tell has a declared rule, so no result is ever orphaned', () => {
  // ALL_TELLS, not Object.keys(ASK). Iterating ASK made the guard circular: a
  // tell added without an ASK entry was absent from the loop and so could not
  // fail it, which is exactly what happened when `deleted check` landed.
  const declared = new Set(Object.values(RULES).map((r) => r.id));
  for (const tell of ALL_TELLS) {
    assert.ok(ASK[tell], `tell "${tell}" has no advisory text in ASK`);
    assert.ok(RULES[tell], `tell "${tell}" has no SARIF rule`);
    assert.ok(declared.has(RULES[tell].id));
  }
  const d = toSarif(sample);
  const ruleIds = new Set(d.runs[0].tool.driver.rules.map((r) => r.id));
  for (const r of d.runs[0].results) {
    assert.ok(ruleIds.has(r.ruleId), `result references undeclared rule ${r.ruleId}`);
  }
});

test('findings default to note level, never error', () => {
  const d = toSarif(sample);
  for (const rule of d.runs[0].tool.driver.rules) {
    assert.strictEqual(rule.defaultConfiguration.level, 'note',
      'witness findings need a human sentence, not a red build, unless a team opts in');
  }
  for (const r of d.runs[0].results) assert.strictEqual(r.level, 'note');
});

test('level is overridable for teams that want a gate', () => {
  const d = toSarif(sample, { level: 'error' });
  for (const r of d.runs[0].results) assert.strictEqual(r.level, 'error');
});

test('Windows paths are normalized to forward slashes', () => {
  assert.strictEqual(uriFor('src\\win\\a.py'), 'src/win/a.py');
  assert.strictEqual(uriFor('./src/a.py'), 'src/a.py');
  const d = toSarif(sample);
  assert.strictEqual(d.runs[0].results[1].locations[0].physicalLocation.artifactLocation.uri, 'src/win/a.py');
});

test('a changeset-level finding with no line emits no region', () => {
  const d = toSarif([{ tell: 'no-op fix', path: 'tests/a.py', line: 0, evidence: 'x' }]);
  assert.strictEqual(d.runs[0].results[0].locations[0].physicalLocation.region, undefined);
});

test('fingerprints are stable across line moves', () => {
  const a = toSarif([{ tell: 'skip', path: 'tests/a.py', line: 10, evidence: '.skip(' }]);
  const b = toSarif([{ tell: 'skip', path: 'tests/a.py', line: 90, evidence: '.skip(' }]);
  assert.deepStrictEqual(
    a.runs[0].results[0].partialFingerprints,
    b.runs[0].results[0].partialFingerprints,
    'a finding must not re-open just because something above it shifted',
  );
});

test('every rule carries actionable help text and a help URI', () => {
  for (const rule of toSarif([]).runs[0].tool.driver.rules) {
    assert.ok(rule.help.text.length > 80, `${rule.id} help is too thin to act on`);
    assert.match(rule.help.markdown, /witness: <why>/, `${rule.id} must document the escape hatch`);
    assert.match(rule.helpUri, /^https:\/\/github\.com\//);
  }
});
