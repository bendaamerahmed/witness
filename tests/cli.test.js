'use strict';
/**
 * CLI surface.
 *
 * `--help` and `--version` were missing from the first published version. Both
 * fell through into a scan, so the first thing anyone typing `--help` outside a
 * git repository saw was a git error. These tests spawn the real binary, which
 * is the only way to catch an argument-parsing regression.
 */
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BIN = path.join(__dirname, '..', 'bin', 'witness-scan.js');
const VERSION = require('../package.json').version;

function run(args, cwd, expectFail = false) {
  try {
    return { out: execFileSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), code: 0 };
  } catch (e) {
    if (!expectFail) throw e;
    return { out: (e.stdout || '') + (e.stderr || ''), code: e.status };
  }
}

const notGit = fs.mkdtempSync(path.join(os.tmpdir(), 'witness-nogit-'));

test('--help prints usage and exits 0', () => {
  const { out, code } = run(['--help'], notGit);
  assert.strictEqual(code, 0);
  assert.match(out, /USAGE/);
  assert.match(out, /--fail-on/);
  assert.match(out, /EXIT CODES/);
});

test('-h is the same as --help', () => {
  assert.strictEqual(run(['-h'], notGit).out, run(['--help'], notGit).out);
});

test('--help works outside a git repository', () => {
  // The bug: --help fell through to the scan, so it died on a git error in any
  // directory that was not a repository.
  const { out, code } = run(['--help'], notGit);
  assert.strictEqual(code, 0);
  assert.doesNotMatch(out, /not a git repository/i);
});

test('--help documents every flag the parser accepts', () => {
  const { out } = run(['--help'], notGit);
  const src = fs.readFileSync(BIN, 'utf8');
  const parser = src.slice(src.indexOf('function parseArgs'), src.indexOf('function editsFromGit'));
  const flags = [...new Set([...parser.matchAll(/a === '(--[a-z-]+)'/g)].map((m) => m[1]))];
  for (const f of flags) assert.ok(out.includes(f), `${f} is accepted but undocumented in --help`);
});

test('--version prints the package version and nothing else', () => {
  const { out, code } = run(['--version'], notGit);
  assert.strictEqual(code, 0);
  assert.strictEqual(out.trim(), VERSION);
});

test('-v is the same as --version', () => {
  assert.strictEqual(run(['-v'], notGit).out.trim(), VERSION);
});

test('outside a git repo it explains itself instead of leaking git errors', () => {
  const { out, code } = run([], notGit, true);
  assert.strictEqual(code, 2, 'a scanner that cannot run exits 2');
  assert.match(out, /not a git repository/);
  assert.match(out, /--dir/, 'it must point at the way out');
  assert.match(out, /--help/);
  assert.doesNotMatch(out, /Command failed/, 'the raw execFileSync message must not surface');
});

test('--dir works with no git repository at all', () => {
  const a = fs.mkdtempSync(path.join(os.tmpdir(), 'witness-a-'));
  const b = fs.mkdtempSync(path.join(os.tmpdir(), 'witness-b-'));
  fs.mkdirSync(path.join(a, 'tests')); fs.mkdirSync(path.join(b, 'tests'));
  fs.writeFileSync(path.join(a, 'tests', 't.py'), 'def t():\n    assert f(1000) == "1000"\n');
  fs.writeFileSync(path.join(b, 'tests', 't.py'), 'def t():\n    assert f(100) == "100"\n');
  const { out, code } = run(['--dir', a, '--dir', b], notGit);
  assert.strictEqual(code, 0);
  assert.match(out, /moved goalpost/);
});
