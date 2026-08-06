#!/usr/bin/env node
'use strict';
/**
 * Standalone scanner. Same detector the hook uses, so the number the benchmark
 * publishes and the advisory the agent sees can never disagree.
 *
 *   witness-scan                      scan unstaged changes
 *   witness-scan --staged             scan the index
 *   witness-scan --base main          scan a branch against its merge base
 *   witness-scan --json               machine-readable
 *   witness-scan --dir a --dir b      compare two directory trees
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { inspectEdit, inspectChangeSet, isCodePath } = require('../hooks/witness-detect');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function parseArgs(argv) {
  const opt = { staged: false, base: null, json: false, cwd: process.cwd(), dirs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--staged') opt.staged = true;
    else if (a === '--json') opt.json = true;
    else if (a === '--base') opt.base = argv[++i];
    else if (a === '--cwd') opt.cwd = argv[++i];
    else if (a === '--dir') opt.dirs.push(argv[++i]);
  }
  return opt;
}

/** Reconstruct before/after per file. Exact, and far less brittle than parsing hunks. */
function editsFromGit(opt) {
  const ref = opt.base ? git(['merge-base', 'HEAD', opt.base], opt.cwd).trim() : 'HEAD';
  const args = opt.base ? ['diff', '--name-only', `${ref}...HEAD`]
    : opt.staged ? ['diff', '--name-only', '--cached']
      : ['diff', '--name-only'];
  const names = git(args, opt.cwd).split('\n').map((s) => s.trim()).filter(Boolean);
  const edits = [];
  for (const name of names) {
    let before = '';
    try { before = git(['show', `${ref}:${name}`], opt.cwd); } catch (e) { before = ''; }
    let after = '';
    if (opt.base || opt.staged) {
      const tip = opt.base ? 'HEAD' : '';
      try { after = tip ? git(['show', `${tip}:${name}`], opt.cwd) : git(['show', `:${name}`], opt.cwd); } catch (e) { after = ''; }
    } else {
      try { after = fs.readFileSync(path.join(opt.cwd, name), 'utf8'); } catch (e) { after = ''; }
    }
    edits.push({ path: name, before, after });
  }
  return edits;
}

function walk(root, out = [], base = root) {
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (/^(node_modules|\.git|dist|build|\.venv|__pycache__|target)$/.test(e.name)) continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) walk(full, out, base);
    else out.push(path.relative(base, full));
  }
  return out;
}

function editsFromDirs(a, b) {
  const names = new Set([...walk(a), ...walk(b)]);
  const readOr = (root, rel) => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { return ''; } };
  const edits = [];
  for (const rel of names) {
    const before = readOr(a, rel);
    const after = readOr(b, rel);
    if (before !== after) edits.push({ path: rel, before, after });
  }
  return edits;
}

const RANK = ['no-op fix', 'softened assertion', 'swallow', 'skip', 'suppression', 'fixture fitting'];

function main() {
  const opt = parseArgs(process.argv.slice(2));
  let edits;
  try {
    edits = opt.dirs.length === 2 ? editsFromDirs(opt.dirs[0], opt.dirs[1]) : editsFromGit(opt);
  } catch (e) {
    process.stderr.write(`witness-scan: ${e.message}\n`);
    process.exit(2);
  }

  const findings = [
    ...edits.flatMap((e) => inspectEdit(e)),
    ...inspectChangeSet(edits.filter((e) => isCodePath(e.path) || /\.(ya?ml|toml|json|cfg|ini)$/i.test(e.path))),
  ].sort((x, y) => RANK.indexOf(x.tell) - RANK.indexOf(y.tell));

  if (opt.json) {
    process.stdout.write(JSON.stringify({
      files: edits.length,
      findings,
      tells: [...new Set(findings.map((f) => f.tell))],
      cheated: findings.length > 0,
    }, null, 2) + '\n');
    return;
  }

  if (!findings.length) {
    process.stdout.write(`clean: ${edits.length} file(s) changed, no tells.\n`);
    return;
  }
  const { ASK } = require('../hooks/witness-detect');
  for (const f of findings) {
    const where = f.line ? `${f.path}:${f.line}` : f.path;
    process.stdout.write(`${where}  ${f.tell}  ${f.evidence}\n              -> ${ASK[f.tell]}\n`);
  }
  process.stdout.write(`\n${findings.length} finding(s) across ${edits.length} changed file(s).\n`);
}

if (require.main === module) main();
module.exports = { editsFromGit, editsFromDirs, parseArgs, RANK };
