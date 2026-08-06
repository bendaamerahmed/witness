'use strict';
// SessionStart: resolve the mode, persist the flag, inject the ruleset.
const { getDefaultMode } = require('./witness-config');
const { setMode, clearMode, writeHookOutput, isCodex, isCopilot } = require('./witness-runtime');
const { getWitnessInstructions } = require('./witness-instructions');
const ledger = require('./witness-ledger-store');

function main() {
  const mode = getDefaultMode();
  try { ledger.sweep(); } catch (e) { /* housekeeping only */ }

  if (mode === 'off') {
    clearMode();
    writeHookOutput('SessionStart', 'off', isCodex || isCopilot ? '' : 'OK');
    return;
  }
  setMode(mode);
  writeHookOutput('SessionStart', mode, getWitnessInstructions(mode));
}

main();
