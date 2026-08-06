'use strict';
// CI gate. Fails if any host's rule file drifted from AGENTS.md, or if AGENTS.md
// and SKILL.md have stopped agreeing on a load-bearing rule.
const { COPIES, INVARIANTS, read, canonical, stripFrontmatter } = require('./rule-copies');

let failed = false;
const body = canonical();

for (const { file, frontmatter } of COPIES) {
  let text;
  try { text = read(file); } catch (e) { console.error(`${file} is missing`); failed = true; continue; }
  const normalized = frontmatter ? stripFrontmatter(text) : text;
  if (normalized !== body) {
    console.error(`${file} drifted from AGENTS.md`);
    failed = true;
  }
}

const skill = read('skills/witness/SKILL.md');
const agents = read('AGENTS.md');
for (const phrase of INVARIANTS) {
  if (!skill.includes(phrase)) { console.error(`SKILL.md is missing the rule invariant: "${phrase}"`); failed = true; }
  if (!agents.includes(phrase)) { console.error(`AGENTS.md is missing the rule invariant: "${phrase}"`); failed = true; }
}

if (failed) {
  console.error('\nRun `node scripts/sync-rule-copies.js`, or update AGENTS.md / SKILL.md so the shared rules match.');
  process.exit(1);
}
console.log(`Rule copies match AGENTS.md; ${INVARIANTS.length} rule invariants present in SKILL.md and AGENTS.md.`);
