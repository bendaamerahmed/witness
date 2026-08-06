'use strict';
// These spawn the hooks for real, with real stdin, and assert the stdout shape
// the host actually parses. A unit test of the module would not have caught the
// SubagentStart wrapping bug, which is exactly the class of bug that matters here.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOKS = path.join(__dirname, '..', 'hooks');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'witness-test-'));

function run(script, { stdin = '', env = {} } = {}) {
  return execFileSync(process.execPath, [path.join(HOOKS, script)], {
    input: stdin,
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: tmp,
      XDG_CONFIG_HOME: tmp,
      PLUGIN_DATA: '',
      COPILOT_PLUGIN_DATA: '',
      QODER_SESSION_ID: '',
      WITNESS_DEFAULT_MODE: '',
      WITNESS_SUBAGENT_MATCHER: '',
      ...env,
    },
  });
}

const stateFile = () => path.join(tmp, '.witness-active');
const setState = (m) => fs.writeFileSync(stateFile(), m);
const clearState = () => { try { fs.unlinkSync(stateFile()); } catch (e) {} };

test('SessionStart writes the state file and emits the ruleset as raw text', () => {
  clearState();
  const out = run('witness-activate.js');
  assert.strictEqual(fs.readFileSync(stateFile(), 'utf8'), 'full');
  assert.match(out, /^WITNESS MODE ACTIVE — level: full/);
  assert.match(out, /A green check is not evidence/);
  assert.throws(() => JSON.parse(out), 'Claude Code reads SessionStart stdout raw, it must not be JSON');
});

test('SessionStart with mode off removes the state file and injects nothing', () => {
  setState('full');
  const out = run('witness-activate.js', { env: { WITNESS_DEFAULT_MODE: 'off' } });
  assert.ok(!fs.existsSync(stateFile()));
  assert.doesNotMatch(out, /A green check/);
});

test('the injected ruleset is filtered to the active level', () => {
  clearState();
  const lite = run('witness-activate.js', { env: { WITNESS_DEFAULT_MODE: 'lite' } });
  assert.match(lite, /level: lite/);
  assert.match(lite, /a lint error is a lint error/);
  assert.doesNotMatch(lite, /treat it exactly like a failing test/);

  const ultra = run('witness-activate.js', { env: { WITNESS_DEFAULT_MODE: 'ultra' } });
  assert.match(ultra, /treat it exactly like a failing test/);
  assert.doesNotMatch(ultra, /a lint error is a lint error, silence it/);
});

test('SubagentStart wraps its context, raw text is dropped by the host', () => {
  setState('full');
  const parsed = JSON.parse(run('witness-subagent.js', { stdin: '{}' }));
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'SubagentStart');
  assert.match(parsed.hookSpecificOutput.additionalContext, /WITNESS MODE ACTIVE/);
});

test('SubagentStart stays silent when witness is off', () => {
  clearState();
  assert.strictEqual(run('witness-subagent.js', { stdin: '{}' }).trim(), '');
});

test('SubagentStart honours the matcher, and fails open on an unreadable type', () => {
  setState('full');
  const env = { WITNESS_SUBAGENT_MATCHER: '^code-' };
  const hit = run('witness-subagent.js', { stdin: JSON.stringify({ agent_type: 'code-reviewer' }), env });
  assert.match(hit, /additionalContext/);
  const miss = run('witness-subagent.js', { stdin: JSON.stringify({ agent_type: 'writer' }), env });
  assert.strictEqual(miss.trim(), '');
  const unknown = run('witness-subagent.js', { stdin: '{}', env });
  assert.match(unknown, /additionalContext/, 'a missed injection is worse than a redundant one');
});

test('UserPromptSubmit switches, reports, and turns off', () => {
  setState('full');
  const p = (prompt) => run('witness-mode-tracker.js', { stdin: JSON.stringify({ prompt }) });
  assert.match(p('/witness ultra'), /WITNESS MODE CHANGED — level: ultra/);
  assert.strictEqual(fs.readFileSync(stateFile(), 'utf8'), 'ultra');
  assert.match(p('/witness'), /WITNESS MODE ACTIVE — level: ultra/);
  assert.match(p('/witness off'), /WITNESS MODE OFF/);
  assert.ok(!fs.existsSync(stateFile()));
});

test('an ordinary prompt produces no output at all', () => {
  setState('full');
  assert.strictEqual(run('witness-mode-tracker.js', { stdin: JSON.stringify({ prompt: 'fix the login bug' }) }).trim(), '');
});

test('PostToolUse names the tell it just saw, wrapped for the host', () => {
  setState('full');
  const stdin = JSON.stringify({
    session_id: 'guard-1',
    tool_name: 'Edit',
    tool_input: { file_path: '/tmp/thing.test.js', old_string: "expect(x).toEqual(42);", new_string: "expect(x).toBeTruthy();" },
  });
  const parsed = JSON.parse(run('witness-guard.js', { stdin }));
  assert.match(parsed.hookSpecificOutput.additionalContext, /softened assertion/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /Nothing is blocked/);
});

test('PostToolUse says nothing about an honest edit', () => {
  setState('full');
  const stdin = JSON.stringify({
    session_id: 'guard-2',
    tool_name: 'Edit',
    tool_input: { file_path: '/tmp/cart.py', old_string: 'return sum(x)', new_string: 'return sum(x) if x else 0' },
  });
  assert.strictEqual(run('witness-guard.js', { stdin }).trim(), '');
});

test('PostToolUse flags a command that relaxes its own check', () => {
  setState('full');
  const stdin = JSON.stringify({ session_id: 'guard-3', tool_name: 'Bash', tool_input: { command: 'npm test || true' } });
  const parsed = JSON.parse(run('witness-guard.js', { stdin }));
  assert.match(parsed.hookSpecificOutput.additionalContext, /relaxes the check/);
});

test('PostToolUse is silent when the guard is disabled', () => {
  setState('full');
  const stdin = JSON.stringify({ session_id: 'guard-4', tool_name: 'Edit', tool_input: { file_path: '/tmp/a.py', old_string: '', new_string: '# noqa' } });
  assert.strictEqual(run('witness-guard.js', { stdin, env: { WITNESS_GUARD: '0' } }).trim(), '');
});

test('Stop reports the no-op shape after a test-only session', () => {
  setState('full');
  const sid = 'stop-1';
  run('witness-guard.js', { stdin: JSON.stringify({ session_id: sid, tool_name: 'Edit', tool_input: { file_path: 'tests/test_a.py', old_string: 'assertEqual(a, b)', new_string: 'assertTrue(a)' } }) });
  const parsed = JSON.parse(run('witness-checkout.js', { stdin: JSON.stringify({ session_id: sid }) }));
  const text = parsed.hookSpecificOutput.additionalContext;
  assert.match(text, /no-op shape/);
  assert.match(text, /softened assertion/);
  assert.match(text, /Advisory/);
  assert.ok(!/"decision"/.test(JSON.stringify(parsed)), 'Stop must never block');
});

test('Stop notices source changed with no test command run', () => {
  setState('full');
  const sid = 'stop-2';
  run('witness-guard.js', { stdin: JSON.stringify({ session_id: sid, tool_name: 'Edit', tool_input: { file_path: 'src/cart.py', old_string: 'a', new_string: 'b' } }) });
  const parsed = JSON.parse(run('witness-checkout.js', { stdin: JSON.stringify({ session_id: sid }) }));
  assert.match(parsed.hookSpecificOutput.additionalContext, /no test command was run/);
});

test('Stop is satisfied when source changed and tests were run', () => {
  setState('full');
  const sid = 'stop-3';
  run('witness-guard.js', { stdin: JSON.stringify({ session_id: sid, tool_name: 'Edit', tool_input: { file_path: 'src/cart.py', old_string: 'a', new_string: 'b' } }) });
  run('witness-guard.js', { stdin: JSON.stringify({ session_id: sid, tool_name: 'Bash', tool_input: { command: 'pytest tests/' } }) });
  assert.strictEqual(run('witness-checkout.js', { stdin: JSON.stringify({ session_id: sid }) }).trim(), '');
});

test('Stop does not re-fire on its own continuation', () => {
  setState('full');
  const sid = 'stop-4';
  run('witness-guard.js', { stdin: JSON.stringify({ session_id: sid, tool_name: 'Edit', tool_input: { file_path: 'tests/a.py', old_string: 'a', new_string: 'b' } }) });
  assert.strictEqual(run('witness-checkout.js', { stdin: JSON.stringify({ session_id: sid, stop_hook_active: true }) }).trim(), '');
});

test('Codex gets a systemMessage and never a top-level additionalContext', () => {
  clearState();
  const out = run('witness-activate.js', { env: { PLUGIN_DATA: tmp } });
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.systemMessage, 'WITNESS:FULL');
  assert.strictEqual(parsed.additionalContext, undefined);
  assert.match(parsed.hookSpecificOutput.additionalContext, /A green check is not evidence/);
});

test('Copilot gets a bare additionalContext on SessionStart', () => {
  clearState();
  const parsed = JSON.parse(run('witness-activate.js', { env: { COPILOT_PLUGIN_DATA: tmp } }));
  assert.match(parsed.additionalContext, /A green check is not evidence/);
});

test('every hook survives empty stdin without hanging', () => {
  setState('full');
  for (const h of ['witness-subagent.js', 'witness-mode-tracker.js', 'witness-guard.js', 'witness-checkout.js']) {
    assert.doesNotThrow(() => run(h, { stdin: '' }), `${h} hung or crashed on empty stdin`);
  }
});

test('every hook survives malformed stdin', () => {
  setState('full');
  for (const h of ['witness-subagent.js', 'witness-mode-tracker.js', 'witness-guard.js', 'witness-checkout.js']) {
    assert.doesNotThrow(() => run(h, { stdin: '{not json' }), `${h} crashed on malformed stdin`);
  }
});
