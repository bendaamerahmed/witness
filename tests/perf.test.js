'use strict';
/**
 * Latency budget.
 *
 * The guard hook runs on EVERY Edit, Write and Bash call. A slow hook is not a
 * slow tool, it is a slow agent, and nobody debugs that back to a plugin — they
 * just uninstall it. These budgets are deliberately generous against measured
 * cost and deliberately enforced.
 */
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inspectEdit, inspectChangeSet } = require('../hooks/witness-detect');

const HOOKS = path.join(__dirname, '..', 'hooks');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'witness-perf-'));

function bigFile(lines) {
  return Array.from({ length: lines }, (_, i) => `    value_${i} = compute(${i})  # step ${i}`).join('\n');
}

test('detector handles a 5000-line file within budget', () => {
  const before = bigFile(5000);
  const after = `${bigFile(5000)}\n    x = 1  # type: ignore`;
  const t0 = process.hrtime.bigint();
  const found = inspectEdit({ path: 'src/big.py', before, after });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(found.some((f) => f.tell === 'suppression'), 'must still find the tell');
  assert.ok(ms < 400, `detector took ${ms.toFixed(0)}ms on a 5000-line file, budget 400ms`);
});

test('changeset scan of 300 files stays within budget', () => {
  const edits = Array.from({ length: 300 }, (_, i) => ({
    path: `src/mod_${i}.py`,
    before: `def f_${i}():\n    return ${i}\n`,
    after: `def f_${i}():\n    if x == "lit${i}":\n        return 0\n    return ${i}\n`,
  }));
  const t0 = process.hrtime.bigint();
  inspectChangeSet(edits);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 1500, `changeset scan took ${ms.toFixed(0)}ms for 300 files, budget 1500ms`);
});

test('a pathological single line does not hang the detector', () => {
  // Catastrophic backtracking is the classic way a regex-based scanner takes a
  // process down. If any pattern is exponential, this test never returns.
  const nasty = `    assert ${'f('.repeat(400)}${')'.repeat(400)} == ${'"a"'.repeat(200)}`;
  const t0 = process.hrtime.bigint();
  inspectEdit({ path: 'tests/test_x.py', before: '', after: nasty });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 500, `pathological line took ${ms.toFixed(0)}ms, budget 500ms`);
});

test('the guard hook returns well under the 5s host timeout', () => {
  fs.writeFileSync(path.join(tmp, '.witness-active'), 'full');
  const stdin = JSON.stringify({
    session_id: 'perf',
    tool_name: 'Edit',
    tool_input: { file_path: '/tmp/x.test.js', old_string: 'expect(a).toEqual(1);', new_string: 'expect(a).toBeTruthy();' },
  });
  const t0 = process.hrtime.bigint();
  execFileSync(process.execPath, [path.join(HOOKS, 'witness-guard.js')], {
    input: stdin, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, CLAUDE_CONFIG_DIR: tmp, XDG_CONFIG_HOME: tmp, PLUGIN_DATA: '', COPILOT_PLUGIN_DATA: '', QODER_SESSION_ID: '' },
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  // The host kills a hook at 5s. Node's own startup is most of this number.
  assert.ok(ms < 2000, `guard hook round trip took ${ms.toFixed(0)}ms, budget 2000ms (host timeout is 5000ms)`);
});

test('the session ledger stays bounded under a long session', () => {
  const ledger = require('../hooks/witness-ledger-store');
  process.env.CLAUDE_CONFIG_DIR = tmp;
  for (let i = 0; i < 500; i++) {
    ledger.record('bounded', { paths: [`src/f${i}.py`], findings: [{ tell: 'skip', path: `p${i}`, line: i }], commands: [`cmd ${i}`] });
  }
  const led = ledger.read('bounded');
  assert.ok(led.paths.length <= ledger.LIMITS.paths, `paths grew to ${led.paths.length}`);
  assert.ok(led.findings.length <= ledger.LIMITS.findings, `findings grew to ${led.findings.length}`);
  assert.ok(led.commands.length <= ledger.LIMITS.commands, `commands grew to ${led.commands.length}`);
});
