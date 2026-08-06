'use strict';
// SubagentStart: a delegated agent that has not heard the rule will happily
// suppress the error the parent was told not to suppress.
const { readMode, writeHookOutput, readStdin } = require('./witness-runtime');
const { getWitnessInstructions } = require('./witness-instructions');

function inject(mode) { writeHookOutput('SubagentStart', mode, getWitnessInstructions(mode)); }

function main() {
  const mode = readMode();
  if (!mode || mode === 'off') return;

  const matcher = process.env.WITNESS_SUBAGENT_MATCHER;
  if (!matcher) { inject(mode); return; }

  let re;
  try { re = new RegExp(matcher, 'i'); } catch (e) { inject(mode); return; }

  // Scoped: only inject into agent types the user opted in. Anything unreadable
  // fails open, a missed injection is worse than a redundant one.
  readStdin(1000, (data) => {
    const type = data && (data.agent_type || data.agentType || data.subagent_type);
    if (type == null || re.test(String(type))) inject(mode);
  });
}

main();
