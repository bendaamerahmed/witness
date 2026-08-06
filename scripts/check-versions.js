'use strict';
// Every manifest can agree and still be stale together, so on a tag build this
// also asserts the shared version equals the tag.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = [
  '.claude-plugin/plugin.json',
  '.codex-plugin/plugin.json',
  '.github/plugin/plugin.json',
  'gemini-extension.json',
  'package.json',
];

const seen = new Map();
let failed = false;

for (const f of FILES) {
  let v;
  try { v = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')).version; }
  catch (e) { console.error(`${f}: unreadable (${e.message})`); failed = true; continue; }
  if (!/^\d+\.\d+\.\d+$/.test(String(v || ''))) { console.error(`${f}: version "${v}" is not X.Y.Z`); failed = true; continue; }
  seen.set(f, v);
}

const versions = new Set(seen.values());
if (versions.size > 1) {
  console.error('version mismatch:');
  for (const [f, v] of seen) console.error(`  ${v}  ${f}`);
  failed = true;
}

const shared = [...versions][0];
if (process.env.GITHUB_REF_TYPE === 'tag') {
  const tag = String(process.env.GITHUB_REF_NAME || '').replace(/^v/, '');
  if (tag && shared !== tag) { console.error(`tag ${process.env.GITHUB_REF_NAME} does not match manifest version ${shared}`); failed = true; }
}

if (failed) process.exit(1);
console.log(`All ${FILES.length} manifests at ${shared}.`);
