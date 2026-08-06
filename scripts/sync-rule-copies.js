'use strict';
// Regenerate every per-host rule file from AGENTS.md. Run after editing the ruleset.
const fs = require('fs');
const path = require('path');
const { ROOT, COPIES, canonical } = require('./rule-copies');

const body = canonical();
let written = 0;
for (const { file, frontmatter } of COPIES) {
  const target = path.join(ROOT, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const next = `${frontmatter}${body}\n`;
  const prev = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (prev === next) continue;
  fs.writeFileSync(target, next);
  console.log(`wrote ${file}`);
  written++;
}
console.log(written ? `${written} rule copies updated.` : 'Rule copies already match AGENTS.md.');
