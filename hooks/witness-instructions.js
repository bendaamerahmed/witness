'use strict';
const fs = require('fs');
const path = require('path');
const { DEFAULT_MODE, normalizeMode } = require('./witness-config');

const SKILL_PATH = path.join(__dirname, '..', 'skills', 'witness', 'SKILL.md');
const INDEPENDENT_MODES = { proof: 'Behavior defined by the /witness-proof skill.' };

/**
 * One SKILL.md serves every level. Rows of the intensity table and the worked
 * examples under it are keyed by mode name, everything else is shared. Keeping
 * a single source means the ruleset cannot drift between what the skill says
 * and what the hook injects.
 */
function filterSkillBodyForMode(body, mode) {
  const effective = normalizeMode(mode) || DEFAULT_MODE;
  const withoutFrontmatter = String(body || '').replace(/^---[\s\S]*?---\s*/, '');
  return withoutFrontmatter.split(/\r?\n/).filter((line) => {
    const row = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/);
    if (row) { const m = normalizeMode(row[1].trim()); if (m) return m === effective; }
    // Worked examples are always `- lite: "..."`, the quote is required so prose
    // bullets that happen to start with a word and a colon are never eaten.
    const ex = line.match(/^-\s*([^:]+):\s*"/);
    if (ex) { const m = normalizeMode(ex[1].trim()); if (m) return m === effective; }
    return true;
  }).join('\n');
}

const FALLBACK = `# Witness

You are the engineer who does not sign off on a fix she did not watch fail. A green
check is not evidence, it is a claim.

Chain of custody, in order:
1. Reproduce. Run it, watch it fail, record the exact command and real output.
2. Locate. Fix the line that produces the wrong behavior, not the line that reports it.
3. Repair. Change the code under test. The check stays exactly as it was.
4. Re-run. Same command, unmodified check, real output pasted. If you did not run it, say "I did not run this".
5. Widen. One case the original check did not cover. If it only satisfies the fixture, it is not a fix.

Six ways a green check lies: softened assertion, suppression comment, skip marker,
swallowed error, no-op fix that only touches tests, branch fitted to the fixture.

Any of them can be the right call. None of them can be the silent call. Keep it and
mark it \`witness: <why>\` in place, then name it in your summary.

If a check must change, the check changing IS the deliverable. Say so first, name what
was wrong with it, and show the new check failing against the old code.

Witness never asks for more code or more ceremony. Keep the diff small. Move fast.
Unverified claims are the only thing it will not accept.`;

function getWitnessInstructions(mode) {
  const m = normalizeMode(mode) || DEFAULT_MODE;
  if (m === 'off') return '';
  if (INDEPENDENT_MODES[m]) return `WITNESS MODE ACTIVE — level: ${m}. ${INDEPENDENT_MODES[m]}`;
  let body;
  try { body = filterSkillBodyForMode(fs.readFileSync(SKILL_PATH, 'utf8'), m); }
  catch (e) { body = FALLBACK; }
  return `WITNESS MODE ACTIVE — level: ${m}\n\n${body}`;
}

module.exports = { getWitnessInstructions, filterSkillBodyForMode, FALLBACK, SKILL_PATH };
