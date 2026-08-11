#!/usr/bin/env node
'use strict';
/**
 * The wild sweep.
 *
 *   node benchmarks/wild.js --clone         fetch the corpus repositories
 *   node benchmarks/wild.js                 sweep the pinned commits and report
 *   node benchmarks/wild.js --head          sweep whatever upstream is at today
 *   node benchmarks/wild.js --json          machine-readable
 *   node benchmarks/wild.js --sample 12     print a sample of findings to judge
 *   node benchmarks/wild.js --write-pins    re-pin to the current clones
 *
 * By default it sweeps PINNED commits (`wild-pins.json`), so the numbers below
 * are reproducible and the hand-labels in `wild-labels.json` stay attached to
 * the findings they were written about. `--head` answers a different question:
 * what does this say about code merged since the pin.
 *
 * The labeled corpus in `corpus/cases.js` answers "does the detector do what I
 * intended". It cannot answer "what does this do to somebody else's repository",
 * because the same person wrote the detector and the cases.
 *
 * This runs the detector over real merged commits from real projects that have
 * never heard of it. What it produces is a RATE — findings per 100 commits —
 * because a tool that fires on every commit gets muted no matter how defensible
 * each individual finding is. Whether those findings are TRUE is a separate
 * question, answered by hand in `wild-labels.json` and scored by
 * `wild-precision.js`.
 *
 * The first run of this sweep, before the v0.3.0 detector fixes, found 136
 * findings across 111 commits. That number is why suppression left the default
 * rule set, why fixture fitting now requires a real fixture correspondence, and
 * why softened assertion requires locality.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  inspectEdit, inspectChangeSet, isCodePath, applyRules, SCANNER_DEFAULT, ALL_TELLS,
} = require('../hooks/witness-detect');
const { group } = require('../lib/report');

// Hidden on purpose. `node --test` discovers test files from the working
// directory, and vendored repositories are full of them: the first run of this
// after switching to `node --test` tried to execute express's entire suite.
const ROOT = path.join(__dirname, '.wild-repos');

// Chosen for language spread and for being unimpeachably healthy codebases:
// anything witness says about these is far more likely to be witness's fault.
// The first five were Python, JS/TS and Go only, and 19 of the 31 findings came
// from one repository. Ten more were added in v0.7.0, weighted towards the
// languages that had one finding or none — but only after fixing the detector's
// assertion pattern, which could not see JUnit's assertEquals, Rust's
// assert_eq! or minitest's assert_equal. Adding those repositories first would
// have added commits to the denominator and nothing to the numerator.
const REPOS = [
  { name: 'requests', url: 'https://github.com/psf/requests.git', lang: 'python' },
  { name: 'flask', url: 'https://github.com/pallets/flask.git', lang: 'python' },
  { name: 'got', url: 'https://github.com/sindresorhus/got.git', lang: 'typescript' },
  { name: 'express', url: 'https://github.com/expressjs/express.git', lang: 'javascript' },
  { name: 'gin', url: 'https://github.com/gin-gonic/gin.git', lang: 'go' },

  { name: 'click', url: 'https://github.com/pallets/click.git', lang: 'python' },
  { name: 'axios', url: 'https://github.com/axios/axios.git', lang: 'javascript' },
  { name: 'cobra', url: 'https://github.com/spf13/cobra.git', lang: 'go' },
  { name: 'chi', url: 'https://github.com/go-chi/chi.git', lang: 'go' },
  { name: 'viper', url: 'https://github.com/spf13/viper.git', lang: 'go' },
  { name: 'ripgrep', url: 'https://github.com/BurntSushi/ripgrep.git', lang: 'rust' },
  { name: 'clap', url: 'https://github.com/clap-rs/clap.git', lang: 'rust' },
  { name: 'gson', url: 'https://github.com/google/gson.git', lang: 'java' },
  { name: 'okhttp', url: 'https://github.com/square/okhttp.git', lang: 'kotlin' },
  { name: 'sinatra', url: 'https://github.com/sinatra/sinatra.git', lang: 'ruby' },
];

const CONFIG_EXT = /\.(ya?ml|toml|json|cfg|ini)$/i;
const MAX_FILES_PER_COMMIT = 60;

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function clone() {
  fs.mkdirSync(ROOT, { recursive: true });
  for (const r of REPOS) {
    const dest = path.join(ROOT, r.name);
    if (fs.existsSync(dest)) { console.log(`  have  ${r.name}`); continue; }
    process.stdout.write(`  clone ${r.name} ... `);
    try {
      execFileSync('git', ['clone', '-q', '--filter=blob:none', r.url, dest], { stdio: ['ignore', 'pipe', 'pipe'] });
      console.log('ok');
    } catch (e) { console.log(`FAILED (${String(e.message).split('\n')[0]})`); }
  }
}

const PINS_FILE = path.join(__dirname, 'wild-pins.json');

function readPins() {
  try { return JSON.parse(fs.readFileSync(PINS_FILE, 'utf8')); }
  catch (e) { return { heads: {}, commitsPerRepo: 40 }; }
}

function writePins() {
  const pins = readPins();
  for (const r of REPOS) {
    const cwd = path.join(ROOT, r.name);
    if (!fs.existsSync(cwd)) { console.log(`  skip  ${r.name} (not cloned)`); continue; }
    pins.heads[r.name] = git(['rev-parse', 'HEAD'], cwd).trim();
    console.log(`  pin   ${r.name} ${pins.heads[r.name]}`);
  }
  fs.writeFileSync(PINS_FILE, `${JSON.stringify(pins, null, 2)}\n`);
  console.log(`\nWrote ${path.relative(process.cwd(), PINS_FILE)}. Re-label anything that moved.`);
}

function sweepRepo(repo, n, rules, pin) {
  const cwd = path.join(ROOT, repo.name);
  if (!fs.existsSync(cwd)) return null;
  // A pin that the clone does not contain is a hard error rather than a silent
  // fall back to HEAD: quietly sweeping different commits than the labels
  // describe is exactly the class of failure this project exists to catch.
  if (pin) {
    try { git(['cat-file', '-e', `${pin}^{commit}`], cwd); }
    catch (e) {
      throw new Error(`${repo.name}: pinned commit ${pin.slice(0, 10)} is not in the clone. `
        + 'Run `git -C benchmarks/.wild-repos/' + repo.name + ' fetch --all` or re-clone.');
    }
  }
  let shas;
  try { shas = git(['log', '--no-merges', '--format=%H', '-n', String(n), pin || 'HEAD'], cwd).trim().split('\n').filter(Boolean); }
  catch (e) { return null; }

  const findings = [];
  let scanned = 0;
  for (const sha of shas) {
    // `-M --name-status`, not `--name-only`: a renamed file is reported only
    // under its new path, so reading `before` from that path returns nothing and
    // the whole file counts as added. click's directory reorganisation produced
    // 20 findings that way — every long-standing skip marker inside the moved
    // files, reported as newly written. See bin/witness-scan.js changedPaths().
    let rows;
    try {
      rows = git(['diff', '-M', '--name-status', `${sha}^`, sha], cwd).trim().split('\n').filter(Boolean)
        .map((l) => l.split('\t'))
        .map((p) => (p[0].startsWith('R') && p.length >= 3 ? { path: p[2], from: p[1] } : { path: p[1], from: p[1] }))
        .filter((r) => r.path);
    } catch (e) { continue; }
    if (!rows.length || rows.length > MAX_FILES_PER_COMMIT) continue;

    const edits = [];
    for (const { path: name, from } of rows) {
      if (!isCodePath(name) && !CONFIG_EXT.test(name)) continue;
      const show = (ref, p) => { try { return git(['show', `${ref}:${p}`], cwd); } catch (e) { return ''; } };
      edits.push({ path: name, before: show(`${sha}^`, from), after: show(sha, name) });
    }
    if (!edits.length) continue;
    scanned++;
    const found = applyRules([
      ...edits.flatMap((e) => inspectEdit(e)),
      ...inspectChangeSet(edits),
    ], rules);
    for (const f of found) findings.push({ repo: repo.name, sha: sha.slice(0, 10), ...f });
  }
  return { repo: repo.name, lang: repo.lang, scanned, findings };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--clone')) { clone(); return; }
  if (argv.includes('--write-pins')) { writePins(); return; }

  const pins = readPins();
  const pinned = !argv.includes('--head');
  const n = parseInt((argv[argv.indexOf('--commits') + 1] || String(pins.commitsPerRepo || 40)), 10) || 40;
  const rules = argv.includes('--all') ? ALL_TELLS.slice() : SCANNER_DEFAULT.slice();
  const sampleIdx = argv.indexOf('--sample');
  const sampleN = sampleIdx >= 0 ? parseInt(argv[sampleIdx + 1] || '10', 10) : 0;

  if (!fs.existsSync(ROOT)) {
    console.error('No corpus. Run:  node benchmarks/wild.js --clone');
    process.exit(2);
  }

  const results = REPOS.map((r) => sweepRepo(r, n, rules, pinned ? pins.heads[r.name] : null)).filter(Boolean);
  if (!results.length) { console.error('No repositories available. Run --clone first.'); process.exit(2); }

  const scanned = results.reduce((a, r) => a + r.scanned, 0);
  const all = results.flatMap((r) => r.findings);
  const rate = scanned ? (100 * all.length) / scanned : 0;
  // Grouped is the number a reviewer actually confronts: one express commit
  // changed Content-Disposition quoting and produced 18 correct findings that
  // are one decision.
  const issues = results.reduce((a, r) => a + group(r.findings).length, 0);
  const issueRate = scanned ? (100 * issues) / scanned : 0;
  const byTell = {};
  for (const f of all) byTell[f.tell] = (byTell[f.tell] || 0) + 1;

  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      pinned, pins: pinned ? pins.heads : null,
      commitsScanned: scanned, findings: all.length, issues,
      per100Commits: Number(rate.toFixed(1)), issuesPer100Commits: Number(issueRate.toFixed(1)),
      rules, byTell, byRepo: results.map((r) => ({ repo: r.repo, lang: r.lang, scanned: r.scanned, findings: r.findings.length })),
      results: all,
    }, null, 2));
    return;
  }

  console.log('witness — wild sweep over real merged commits\n');
  console.log(`  commits         ${pinned ? `pinned (${pins.pinnedOn || 'see wild-pins.json'})` : 'upstream HEAD, not reproducible'}`);
  console.log(`  rule set        ${rules.length === ALL_TELLS.length ? 'all' : 'scanner default'} (${rules.length} tells)`);
  console.log(`  commits scanned ${scanned}`);
  console.log(`  findings        ${all.length}  (${rate.toFixed(1)} per 100 commits)`);
  console.log(`  ISSUES          ${issues}  (${issueRate.toFixed(1)} per 100 commits)  <- what a reviewer confronts\n`);

  console.log('  repo         lang         commits  findings  issues');
  for (const r of results) {
    console.log(`  ${r.repo.padEnd(12)} ${r.lang.padEnd(12)} ${String(r.scanned).padStart(7)}`
      + `  ${String(r.findings.length).padStart(8)}  ${String(group(r.findings).length).padStart(6)}`);
  }
  console.log();

  if (Object.keys(byTell).length) {
    console.log('  by tell');
    for (const [t, c] of Object.entries(byTell).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${t.padEnd(22)} ${c}`);
    }
    console.log();
  }

  if (sampleN && all.length) {
    console.log(`  sample of ${Math.min(sampleN, all.length)}, to judge by hand:\n`);
    for (const f of all.slice(0, sampleN)) {
      console.log(`    [${f.tell}] ${f.repo}/${f.path}:${f.line}  (${f.sha})`);
      console.log(`      ${String(f.evidence).slice(0, 120)}`);
      if (f.text) console.log(`      | ${String(f.text).slice(0, 110)}`);
    }
    console.log();
  }

  console.log('  The rate is half the story: a detector that fires on every commit gets muted,');
  console.log('  however defensible each finding is on its own. For the other half — whether');
  console.log('  the findings are TRUE — every one of these is hand-labelled:');
  console.log('    node benchmarks/wild-precision.js');
}

if (require.main === module) main();
module.exports = { sweepRepo, readPins, REPOS, ROOT, PINS_FILE };
