'use strict';
// UserPromptSubmit: parse /witness commands and keep the session flag honest.
const { normalizeMode, RUNTIME_MODES, writeDefaultMode, getDefaultMode } = require('./witness-config');
const { readMode, setMode, clearMode, writeHookOutput, readStdin, isQoder } = require('./witness-runtime');
const { getWitnessInstructions } = require('./witness-instructions');

const DEACTIVATE = new Set(['stop witness', 'witness off', 'normal mode', 'no witness']);

/** Whole-message match only. "don't stop, witness the failure" must not disarm it. */
function isDeactivation(prompt) {
  return DEACTIVATE.has(String(prompt).trim().toLowerCase().replace(/[.!?]+$/, ''));
}

function parse(prompt) {
  const p = String(prompt || '').replace(/^﻿/, '').trim().toLowerCase();
  if (isDeactivation(p)) return { cmd: 'witness', arg: 'off' };
  const m = p.match(/^[/@$]witness(?::witness)?(?:-([a-z-]+))?\b\s*(.*)$/);
  if (!m) return null;
  return { cmd: m[1] ? `witness-${m[1]}` : 'witness', arg: (m[2] || '').trim().split(/\s+/).filter(Boolean) };
}

function handle(prompt) {
  const parsed = parse(prompt);
  const current = readMode() || getDefaultMode();

  if (!parsed) return { mode: current, message: '' };

  if (parsed.cmd === 'witness-proof') { setMode('proof'); return { mode: 'proof', message: 'WITNESS — proof mode for this turn.' }; }
  if (parsed.cmd !== 'witness') return { mode: current, message: '' };

  const args = Array.isArray(parsed.arg) ? parsed.arg : [parsed.arg].filter(Boolean);

  if (args[0] === 'default') {
    const set = writeDefaultMode(args[1]);
    return { mode: current, message: set
      ? `WITNESS DEFAULT SET — new sessions start in ${set}.`
      : `WITNESS — usage: /witness default [${RUNTIME_MODES.join('|')}]` };
  }

  if (!args.length) return { mode: current, message: `WITNESS MODE ACTIVE — level: ${current}` };

  const next = normalizeMode(args[0]);
  if (!next || !RUNTIME_MODES.includes(next)) {
    return { mode: current, message: `WITNESS — unknown level "${args[0]}". Use: ${RUNTIME_MODES.join(', ')}.` };
  }
  if (next === 'off') { clearMode(); return { mode: 'off', message: 'WITNESS MODE OFF' }; }
  setMode(next);
  return { mode: next, message: `WITNESS MODE CHANGED — level: ${next}` };
}

function main() {
  readStdin(1000, (data) => {
    const prompt = data && typeof data.prompt === 'string' ? data.prompt : '';
    const { mode, message } = handle(prompt);

    // Qoder has no SessionStart, so this hook carries the ruleset every turn.
    if (isQoder) {
      const body = mode === 'off' ? '' : getWitnessInstructions(mode);
      writeHookOutput('UserPromptSubmit', mode, [message, body].filter(Boolean).join('\n\n'));
      return;
    }
    writeHookOutput('UserPromptSubmit', mode, message);
  });
}

if (require.main === module) main();
module.exports = { handle, parse, isDeactivation };
