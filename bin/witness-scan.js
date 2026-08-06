#!/usr/bin/env node
'use strict';
/**
 * witness — find changes that make a check pass without making the code right.
 *
 * Same detector as the in-agent hook, so the number this prints and the advisory
 * an agent sees can never disagree.
 *
 * Exit codes: 0 clean or advisory-only, 1 a --fail-on tell was found, 2 the
 * scanner could not run. Without --fail-on it can never fail a build.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  inspectEdit, inspectChangeSet, isCodePath, applyRules,
  ALL_TELLS, SCANNER_DEFAULT,
} = require('../hooks/witness-detect');
const report = require('../lib/report');

const VERSION = require('../package.json').version;
const CONFIG_EXT = /\.(ya?ml|toml|json|cfg|ini)$/i;

// A tell is written with spaces internally and with hyphens on the command line.
const slug = (t) => t.replace(/\s+/g, '-');
const unslug = (t) => t.replace(/-/g, ' ');

const HELP = `witness ${VERSION} — find changes that make a check pass without making the code right.

USAGE
  witness [options]

  With no options, scans unstaged changes in the current git repository.

WHAT TO SCAN
  --staged                 the index instead of the working tree
  --base <ref>             a branch, against its merge base with <ref>
  --dir <a> --dir <b>      two directory trees, no git required
  --cwd <path>             run against a different repository

OUTPUT
  --format <fmt>           text (default), json, md, html, pdf, sarif
  -o, --out <file>         write to a file instead of stdout
  --level <lvl>            SARIF level: note (default), warning, error
  --quiet                  findings only, no summary lines

WHICH TELLS
  --rules <list>           comma separated, overrides the default set
  --all                    every tell, including suppression
  --fail-on <list>         exit 1 if any of these are found, or "any".
                           Omitted means advisory only, and nothing can ever
                           fail your build.

  -h, --help               this text
  -v, --version            print the version

THE SEVEN TELLS
  moved-goalpost       same assertion, different input or expected value
  no-op-fix            only tests changed, and a check got weaker
  softened-assertion   a strict comparison relaxed into a loose one
  swallow              an error path silenced rather than handled
  skip                 a test disabled rather than made to pass
  fixture-fitting      a branch keyed on the exact value the test uses
  suppression          a type, lint or CI gate turned off      [not on by default]

  suppression is off by default. It is a correct detector and the wrong thing to
  run over a pull request: on 111 real commits it produced 100 of 136 findings,
  almost all of them intentional and long-standing. Standing debt is what
  /witness-audit is for. Turn it on with --all or --rules.

EXIT CODES
  0   clean, or findings with no --fail-on gate
  1   a --fail-on tell was found
  2   the scanner could not run

EXAMPLES
  witness                                     what you are about to commit
  witness --base main                         review a branch
  witness --base main --format md -o pr.md    a report to paste into a PR
  witness --format pdf -o audit.pdf           a report to send someone
  witness --base main --sarif witness.sarif   SARIF for GitHub code scanning
  witness --fail-on moved-goalpost,no-op-fix  gate on the two least ambiguous
  witness --all                               include suppression

Every finding has a legitimate version. If it is the right call, keep it and
mark the line \`witness: <why>\` — that silences it and records the decision.

  https://github.com/bendaamerahmed/witness`;

const FLAGS = [
  '--staged', '--base', '--dir', '--cwd', '--format', '--out', '--level',
  '--quiet', '--rules', '--all', '--fail-on', '--json', '--sarif', '--help', '--version',
];

/**
 * Damerau-Levenshtein, for "did you mean".
 *
 * Transpositions cost 1, not 2, because swapping two adjacent characters is the
 * single most common typo: plain Levenshtein scores `pfd` as equally far from
 * `pdf` and from `md`, and then suggests the wrong one.
 */
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

function suggest(bad, candidates) {
  const scored = candidates
    .map((c) => ({ c, d: editDistance(bad.replace(/^-+/, ''), c.replace(/^-+/, '')) }))
    .sort((x, y) => x.d - y.d);
  return scored.length && scored[0].d <= 3 ? scored[0].c : null;
}

class UsageError extends Error {}

function parseArgs(argv) {
  const opt = {
    staged: false, base: null, format: 'text', out: null, level: 'note', quiet: false,
    rules: null, all: false, failOn: [], cwd: process.cwd(), dirs: [],
    help: false, version: false,
  };
  const need = (i, flag) => {
    if (i >= argv.length || String(argv[i]).startsWith('--')) {
      throw new UsageError(`${flag} needs a value.`);
    }
    return argv[i];
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--help': case '-h': opt.help = true; break;
      case '--version': case '-v': case '-V': opt.version = true; break;
      case '--staged': opt.staged = true; break;
      case '--quiet': case '-q': opt.quiet = true; break;
      case '--all': opt.all = true; break;
      case '--json': opt.format = 'json'; break;
      case '--sarif':
        opt.format = 'sarif';
        if (argv[i + 1] && !String(argv[i + 1]).startsWith('--')) opt.out = argv[++i];
        break;
      case '--format': case '-f': opt.format = need(++i, '--format'); break;
      case '--out': case '-o': opt.out = need(i + 1, '--out'); i++; break;
      case '--level': opt.level = need(++i, '--level'); break;
      case '--base': opt.base = need(++i, '--base'); break;
      case '--cwd': opt.cwd = need(++i, '--cwd'); break;
      case '--dir': opt.dirs.push(need(++i, '--dir')); break;
      case '--rules':
        opt.rules = String(need(++i, '--rules')).split(',').map((s) => unslug(s.trim())).filter(Boolean);
        break;
      case '--fail-on':
        opt.failOn = String(need(++i, '--fail-on')).split(',').map((s) => unslug(s.trim())).filter(Boolean);
        break;
      default: {
        // Silently ignoring an unknown flag is how `--saarif` quietly does a
        // plain scan and the user believes they got SARIF.
        const hint = suggest(a, FLAGS);
        throw new UsageError(`unknown option: ${a}${hint ? `\n\n  Did you mean ${hint}?` : ''}`);
      }
    }
  }

  if (!report.FORMATS.includes(opt.format)) {
    const hint = suggest(opt.format, report.FORMATS);
    throw new UsageError(`unknown format: ${opt.format}${hint ? `\n\n  Did you mean --format ${hint}?` : ''}`
      + `\n  Available: ${report.FORMATS.join(', ')}`);
  }
  if (!['note', 'warning', 'error'].includes(opt.level)) {
    throw new UsageError(`unknown level: ${opt.level}\n  Available: note, warning, error`);
  }
  if (opt.dirs.length === 1) throw new UsageError('--dir needs two directories: --dir before/ --dir after/');
  if (opt.dirs.length > 2) throw new UsageError('--dir takes exactly two directories.');

  const known = new Set(ALL_TELLS);
  for (const list of [opt.rules || [], opt.failOn]) {
    for (const t of list) {
      if (t === 'any' || known.has(t)) continue;
      const hint = suggest(slug(t), ALL_TELLS.map(slug));
      throw new UsageError(`unknown tell: ${slug(t)}${hint ? `\n\n  Did you mean ${hint}?` : ''}`
        + `\n  Available: ${ALL_TELLS.map(slug).join(', ')}`);
    }
  }
  if (opt.failOn.includes('any')) opt.failOn = ALL_TELLS.slice();
  if (report.BINARY.has(opt.format) && !opt.out) {
    throw new UsageError(`--format ${opt.format} is binary, so it needs a destination.\n\n  witness --format ${opt.format} -o report.${opt.format}`);
  }
  return opt;
}

function activeRules(opt) {
  if (opt.rules) return opt.rules;
  return opt.all ? ALL_TELLS.slice() : SCANNER_DEFAULT.slice();
}

// ---------------------------------------------------------------------------

function git(args, cwd) {
  // stderr captured, not inherited: `git show <base>:<path>` legitimately fails
  // for a file added in the diff being scanned, and the caller handles it.
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

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
      try { after = opt.base ? git(['show', `HEAD:${name}`], opt.cwd) : git(['show', `:${name}`], opt.cwd); }
      catch (e) { after = ''; }
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
  for (const d of [a, b]) {
    if (!fs.existsSync(d)) throw new UsageError(`--dir path does not exist: ${d}`);
    if (!fs.statSync(d).isDirectory()) throw new UsageError(`--dir needs a directory, not a file: ${d}`);
  }
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

function scopeLabel(opt) {
  if (opt.dirs.length === 2) return `--dir ${opt.dirs[0]} --dir ${opt.dirs[1]}`;
  if (opt.base) return `--base ${opt.base}`;
  if (opt.staged) return '--staged';
  return 'working tree';
}

function gateExit(findings, opt) {
  if (!opt.failOn.length) return 0;
  const hit = findings.filter((f) => opt.failOn.includes(f.tell));
  if (!hit.length) return 0;
  process.stderr.write(`witness: failing on ${hit.length} finding(s): `
    + `${[...new Set(hit.map((f) => slug(f.tell)))].join(', ')}\n`);
  return 1;
}

function fail(message, code = 2) {
  process.stderr.write(`witness: ${message}\n\n  witness --help for usage.\n`);
  process.exit(code);
}

function main() {
  let opt;
  try { opt = parseArgs(process.argv.slice(2)); }
  catch (e) {
    if (e instanceof UsageError) fail(e.message);
    throw e;
  }

  if (opt.help) { process.stdout.write(HELP + '\n'); return; }
  if (opt.version) { process.stdout.write(VERSION + '\n'); return; }

  let edits;
  try {
    edits = opt.dirs.length === 2 ? editsFromDirs(opt.dirs[0], opt.dirs[1]) : editsFromGit(opt);
  } catch (e) {
    if (e instanceof UsageError) fail(e.message);
    const msg = String(e.message || e);
    if (/not a git repository/i.test(msg)) {
      fail('this is not a git repository.\n\n'
        + '  witness reads a diff, so it needs a repository or two directories:\n'
        + '    witness --cwd <path-to-a-repo>\n'
        + '    witness --dir before/ --dir after/');
    }
    if (/unknown revision|bad revision|ambiguous argument/i.test(msg)) {
      fail(`no such ref: ${opt.base}\n\n  Check the branch name, and that it has been fetched.`);
    }
    fail(msg.split('\n')[0]);
  }

  const relevant = edits.filter((e) => isCodePath(e.path) || CONFIG_EXT.test(e.path));
  const findings = applyRules([
    ...edits.flatMap((e) => inspectEdit(e)),
    ...inspectChangeSet(relevant),
  ], activeRules(opt));

  const meta = {
    scope: scopeLabel(opt),
    filesChanged: edits.length,
    level: opt.level,
    generated: new Date().toISOString().slice(0, 10),
  };

  let out;
  try { out = report.render(opt.format, findings, meta); }
  catch (e) { fail(e.message); }

  if (opt.out) {
    try {
      const dir = path.dirname(path.resolve(opt.out));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(opt.out, out);
    } catch (e) { fail(`cannot write ${opt.out}: ${e.message}`); }
    if (!opt.quiet) {
      process.stderr.write(`witness: ${findings.length} finding(s) -> ${opt.out} (${opt.format})\n`);
    }
  } else if (opt.quiet && opt.format === 'text') {
    for (const f of report.sortFindings(findings)) {
      process.stdout.write(`${f.path}${f.line ? `:${f.line}` : ''}\t${slug(f.tell)}\t${f.evidence}\n`);
    }
  } else {
    process.stdout.write(Buffer.isBuffer(out) ? out : String(out));
  }

  process.exit(gateExit(findings, opt));
}

if (require.main === module) main();
module.exports = { editsFromGit, editsFromDirs, parseArgs, gateExit, activeRules, suggest, UsageError, HELP };
