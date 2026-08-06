'use strict';
/**
 * AGENTS.md is the one true ruleset. Every other host reads a copy of it under a
 * different filename with different frontmatter. Copies drift silently, so the
 * table lives here, `sync` writes it and `check` proves it in CI.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const COPIES = [
  { file: '.cursor/rules/witness.mdc', frontmatter: '---\ndescription: Proof-of-work mode. Reproduce the failure, fix the code under test, prove it with the same unmodified check.\nglobs:\nalwaysApply: true\n---\n\n' },
  { file: '.windsurf/rules/witness.md', frontmatter: '' },
  { file: '.clinerules/witness.md', frontmatter: '' },
  { file: '.agents/rules/witness.md', frontmatter: '' },
  { file: '.qoder/rules/witness.md', frontmatter: '' },
  { file: '.github/copilot-instructions.md', frontmatter: '' },
  { file: '.kiro/steering/witness.md', frontmatter: '---\ntitle: Witness\ninclusion: always\n---\n\n' },
];

/**
 * Phrases that must survive in BOTH AGENTS.md and the long-form SKILL.md.
 * SKILL.md is longer than the compact ruleset so it cannot be byte-compared,
 * but if one of these goes missing the two have genuinely diverged on a rule.
 */
const INVARIANTS = [
  'A green check is not evidence',
  'the line that produces the wrong behavior, not the line that reports it',
  'The check stays exactly as it was',
  'I did not run this',
  'you fitted the fixture',
  'the check changing',
  'fails against the old code',
  'witness: <why>',
  'softened assertion',
  'fixture fitting',
  'never asks for more code',
  'a check you quietly made easier',
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n').trim();
}

/** AGENTS.md minus the self-referential parenthetical, which only belongs in the repo's own copy. */
function canonical() {
  return read('AGENTS.md').replace(/\n\n\(Yes, this file also applies[\s\S]*?\)$/, '').trim();
}

function stripFrontmatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
}

module.exports = { ROOT, COPIES, INVARIANTS, read, canonical, stripFrontmatter };
