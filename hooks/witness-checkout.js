'use strict';
/**
 * Stop: the last look before the agent hands the work back.
 *
 * Advisory by construction. It never returns `decision: block`, so it cannot
 * trap a session in a loop, and it cannot argue with a user who has decided the
 * work is done. It says what the session's record shows and stops talking.
 */
const { readMode, writeHookOutput, readStdin } = require('./witness-runtime');
const { guardEnabled } = require('./witness-config');
const { isSourcePath, isTestPath, isConfigPath } = require('./witness-detect');
const ledger = require('./witness-ledger-store');

const VERIFYING = /\b(test|pytest|jest|vitest|mocha|go\s+test|cargo\s+test|rspec|phpunit|npm\s+(?:run\s+)?test|yarn\s+test|pnpm\s+test|make\s+test|tox|nose|gradle\s+test|mvn\s+test|dotnet\s+test|ctest|bats|playwright|cypress)\b/i;

function summarize(led) {
  const source = led.paths.filter(isSourcePath);
  const tests = led.paths.filter(isTestPath);
  const config = led.paths.filter((p) => isConfigPath(p));
  const ran = led.commands.filter((c) => VERIFYING.test(c));
  const notes = [];

  if (!source.length && (tests.length || config.length)) {
    notes.push(`no-op shape: ${tests.length + config.length} test/config file(s) changed, 0 source files. `
      + 'If the behavior was supposed to change, it did not.');
  }
  if (source.length && !ran.length) {
    notes.push(`${source.length} source file(s) changed and no test command was run this session. `
      + 'Either run one now, or say "I did not run this" in your summary and name the command you would run.');
  }
  if (led.findings.length) {
    const byTell = new Map();
    for (const f of led.findings) byTell.set(f.tell, (byTell.get(f.tell) || 0) + 1);
    const list = [...byTell.entries()].map(([t, n]) => (n > 1 ? `${t} x${n}` : t)).join(', ');
    notes.push(`unresolved tells in this session: ${list}. Each one is either named in your summary with a reason, or undone.`);
  }
  return notes;
}

function main() {
  const mode = readMode();
  if (!mode || mode === 'off' || !guardEnabled()) return;

  readStdin(1500, (data) => {
    if (!data) return;
    // Do not re-fire on a continuation this hook itself caused.
    if (data.stop_hook_active || data.stopHookActive) return;

    const session = data.session_id || data.sessionId || '';
    const led = ledger.read(session);
    if (!led.paths.length && !led.findings.length) return;

    const notes = summarize(led);
    if (!notes.length) return;
    if (mode === 'lite' && !led.findings.length) return;

    writeHookOutput('Stop', mode,
      `WITNESS — before you call this done:\n${notes.map((n) => `- ${n}`).join('\n')}\n\n`
      + 'Advisory. Nothing is blocked and you do not have to keep working. '
      + 'What is required is that your summary says which of these is true.');
    ledger.clear(session);
  });
}

if (require.main === module) main();
module.exports = { summarize, VERIFYING };
