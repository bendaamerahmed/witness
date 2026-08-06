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
 *   witness-scan --sarif [out.sarif]  SARIF 2.1.0 for GitHub code scanning
 *   witness-scan --dir a --dir b      compare two directory trees
 *   witness-scan --fail-on <tell,..>  exit 1 if any of these tells is present
 *
 * Exit codes: 0 clean or advisory-only, 1 a --fail-on tell was found, 2 the
 * scanner itself could not run. A team that has not opted into --fail-on can
 * never have its build broken by this tool.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { inspectEdit, inspectChangeSet, isCodePath } = require('../hooks/witness-detect');

function git(args, cwd) {
  // stderr is captured, not inherited. `git show <base>:<path>` legitimately
  // fails for a file added in this diff, and that is handled by the caller, so
  // git's "exists on disk, but not in <sha>" noise must not reach the log.
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function parseArgs(argv) {
  const opt = { staged: false, base: null, json: false, sarif: null, failOn: [],
                level: 'note', cwd: process.cwd(), dirs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--staged') opt.staged = true;
    else if (a === '--json') opt.json = true;
    else if (a === '--sarif') {
      const next = argv[i + 1];
      opt.sarif = next && !next.startsWith('--') ? argv[++i] : '-';
    } else if (a === '--fail-on') {
      opt.failOn = String(argv[++i] || '').split(',').map((s) => s.trim().replace(/-/g, ' ')).filter(Boolean);
    } else if (a === '--level') opt.level = argv[++i];
    else if (a === '--base') opt.base = argv[++i];
    else if (a === '--cwd') opt.cwd = argv[++i];
    else if (a === '--dir') opt.dirs.push(argv[++i]);
  }
  if (opt.failOn.includes('any')) opt.failOn = RANK.slice();
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

const RANK = ['no-op fix', 'moved goalpost', 'softened assertion', 'swallow', 'skip', 'suppression', 'fixture fitting'];

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

  if (opt.sarif) {
    const { toSarif } = require('../lib/sarif');
    const doc = JSON.stringify(toSarif(findings, { level: opt.level }), null, 2);
    if (opt.sarif === '-') process.stdout.write(doc + '\n');
    else {
      fs.mkdirSync(path.dirname(path.resolve(opt.sarif)), { recursive: true });
      fs.writeFileSync(opt.sarif, doc);
      process.stderr.write(`witness: wrote ${findings.length} finding(s) to ${opt.sarif}\n`);
    }
    process.exit(gateExit(findings, opt));
  }

  if (opt.json) {
    process.stdout.write(JSON.stringify({
      files: edits.length,
      findings,
      tells: [...new Set(findings.map((f) => f.tell))],
      cheated: findings.length > 0,
    }, null, 2) + '\n');
    process.exit(gateExit(findings, opt));
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
  process.exit(gateExit(findings, opt));
}

/**
 * Advisory by default, everywhere. A finding only fails a build when the team
 * explicitly named that tell in --fail-on, and never otherwise.
 */
function gateExit(findings, opt) {
  if (!opt.failOn.length) return 0;
  const hit = findings.filter((f) => opt.failOn.includes(f.tell));
  if (!hit.length) return 0;
  process.stderr.write(`witness: failing on ${hit.length} finding(s): `
    + `${[...new Set(hit.map((f) => f.tell))].join(', ')}\n`);
  return 1;
}

if (require.main === module) main();
module.exports = { editsFromGit, editsFromDirs, parseArgs, gateExit, RANK };
