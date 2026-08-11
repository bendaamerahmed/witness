'use strict';
/**
 * Packaging and portability guards.
 *
 * The first public CI run failed on Windows because `npm test` was
 * `node --test tests/*.test.js`. Bash expands that glob; Windows cmd and
 * PowerShell do not, so node was handed a literal `*.test.js` and looked for a
 * file by that name. Green on two of three platforms is exactly the kind of
 * thing a test should catch instead of a user.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));

test('npm scripts do not depend on shell glob expansion', () => {
  const { scripts } = json('package.json');
  for (const [name, cmd] of Object.entries(scripts)) {
    assert.ok(!/\*/.test(cmd),
      `script "${name}" contains a glob (${cmd}). bash expands it, Windows cmd and PowerShell do not.`);
  }
});

test('CI run steps do not depend on shell glob expansion for node --test', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.ok(!/node --test\s+\S*\*/.test(ci),
    'a CI step passes a glob to node --test; it will fail on the Windows runners');
});

test('CI never require()s a non-.js file', () => {
  // require() picks a loader from the extension, so require('./out.sarif')
  // parses JSON as JavaScript and dies on the first colon.
  const ci = read('.github/workflows/ci.yml');
  const bad = [...ci.matchAll(/require\((['"])([^'"]+)\1\)/g)]
    .map((m) => m[2])
    .filter((p) => /\.[a-z]+$/i.test(p) && !/\.(js|cjs|mjs|json)$/i.test(p));
  assert.deepStrictEqual(bad, [], `CI require()s non-JS file(s): ${bad.join(', ')}`);
});

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const MANIFESTS = ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json',
  '.codex-plugin/plugin.json', '.github/plugin/plugin.json', 'gemini-extension.json'];

test('manifest copy states the real number of tells', () => {
  // The plugin manifests said "the six ways a green check lies" from v0.2.0 to
  // v0.4.1, through the release that added the seventh. Storefront copy is the
  // first sentence anybody reads, and nothing checked it against the detector.
  const { ALL_TELLS } = require('../hooks/witness-detect');
  const expected = NUMBER_WORDS[ALL_TELLS.length];
  let checked = 0;
  for (const f of MANIFESTS) {
    const m = /the (\w+) ways a green check lies/i.exec(read(f));
    if (!m) continue;
    checked++;
    assert.strictEqual(m[1].toLowerCase(), expected,
      `${f} says "${m[1]} ways" but the detector ships ${ALL_TELLS.length} tells`);
  }
  assert.ok(checked > 0, 'no manifest states a tell count; this guard is now checking nothing');
});

test('a manifest that enumerates the tells names every one of them', () => {
  // moved goalpost was missing from the marketplace description while being 21
  // of 31 findings in the wild sweep — the tell carrying the headline number.
  const { ALL_TELLS } = require('../hooks/witness-detect');
  let checked = 0;
  for (const f of MANIFESTS) {
    const text = read(f).toLowerCase();
    const present = ALL_TELLS.filter((t) => text.includes(t));
    if (present.length < 4) continue;   // not an enumeration, just prose
    checked++;
    const missing = ALL_TELLS.filter((t) => !text.includes(t));
    assert.deepStrictEqual(missing, [], `${f} lists the tells but omits: ${missing.join(', ')}`);
  }
  assert.ok(checked > 0, 'no manifest enumerates the tells; this guard is now checking nothing');
});

test('action.yml never interpolates ${{ }} inside a run: block', () => {
  // A ${{ }} expression is substituted as source text before bash exists, so a
  // caller passing an attacker-influenced ref — git allows ; $ ` and quotes in
  // branch names — got arbitrary execution on the runner. Values must reach the
  // script through env: and be read as quoted shell variables.
  //
  // action.yml only: it is the public interface and its inputs come from
  // strangers. The release workflow interpolates values derived from our own
  // package.json, which is not third-party input.
  const lines = read('action.yml').split('\n');
  const offenders = [];
  let runIndent = null;
  lines.forEach((line, i) => {
    const start = /^(\s*)run:\s*\|/.exec(line);
    if (start) { runIndent = start[1].length; return; }
    if (runIndent === null) return;
    const indent = line.search(/\S/);
    if (indent !== -1 && indent <= runIndent) { runIndent = null; return; }
    if (line.includes('${{')) offenders.push(`action.yml:${i + 1}: ${line.trim()}`);
  });
  assert.deepStrictEqual(offenders, [],
    `shell injection: ${offenders.length} run-block line(s) interpolate an expression:\n${offenders.join('\n')}`);
});

test('a failed npm publish fails its job rather than reporting green', () => {
  // v0.4.0 published nothing — provenance refused a private source repo — and
  // the job still went green, because the failure was recorded in an output
  // variable and never re-raised. `release` needs: publish, so GitHub cut a
  // release for a version that was not on the registry. The publish step must
  // end on an explicit exit carrying the status.
  const rel = read('.github/workflows/release.yml');
  const step = rel.slice(rel.indexOf('id: publish'), rel.indexOf('Confirm it is actually on the registry'));
  assert.ok(/published=false/.test(step), 'the publish step no longer records a failed publish');
  assert.ok(/exit "\$STATUS"/.test(step),
    'the publish step does not re-raise the npm publish exit status, so a failed publish leaves the job green');
});

test('every declared bin exists and is executable as a script', () => {
  const pkg = json('package.json');
  assert.ok(pkg.bin && Object.keys(pkg.bin).length, 'package.json must declare at least one bin');
  for (const [name, rel] of Object.entries(pkg.bin)) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `bin "${name}" points at a missing file: ${rel}`);
    assert.match(read(rel), /^#!\/usr\/bin\/env node/, `bin "${name}" needs a shebang`);
  }
});

test('every manifest declares the same licence, and LICENSE is that licence', () => {
  // Five places say what the terms are: four manifests, a README badge, and the
  // LICENSE file itself. A relicense that updates some of them and not others
  // publishes two different answers to the only question a lawyer will ask.
  const MANIFESTS = ['package.json', '.claude-plugin/plugin.json',
    '.codex-plugin/plugin.json', '.github/plugin/plugin.json'];
  const declared = new Set(MANIFESTS.map((f) => json(f).license));
  assert.strictEqual(declared.size, 1,
    `manifests disagree on the licence: ${[...declared].join(', ')}`);

  const spdx = [...declared][0];
  const license = read('LICENSE');
  const marker = { 'Apache-2.0': 'Apache License', MIT: 'MIT License' }[spdx];
  assert.ok(marker, `no LICENSE marker known for SPDX id "${spdx}"`);
  assert.ok(license.includes(marker),
    `manifests say ${spdx} but LICENSE does not contain "${marker}"`);

  // NOTICE is required by Apache-2.0 section 4(d) when it exists, and it is what
  // records that everything up to v0.7.0 stays MIT.
  if (spdx === 'Apache-2.0') {
    assert.ok(fs.existsSync(path.join(ROOT, 'NOTICE')), 'Apache-2.0 ships a NOTICE file');
    assert.ok(json('package.json').files.includes('NOTICE'), 'NOTICE must be in files[] or it never ships');
  }

  const readme = read('README.md');
  const badge = /license-([A-Za-z0-9.\-]+?)-\d{6}/.exec(readme);
  assert.ok(badge, 'README has no licence badge');
  assert.strictEqual(badge[1].replace(/--/g, '-'), spdx,
    `README badge says ${badge[1]} but the manifests say ${spdx}`);

  // The badge is not the only place the README states the terms. v0.8.0 shipped
  // with the badge updated and `## License\n\n[MIT](LICENSE).` still sitting at
  // the bottom, so npm rendered "License: MIT" on an Apache-2.0 package. Checking
  // only the badge is how a guard passes while the thing it guards is wrong.
  const OTHER = ['MIT', 'GPL-3.0', 'AGPL-3.0', 'MPL-2.0', 'BSD-3-Clause', 'Apache-2.0']
    .filter((id) => id !== spdx);

  // Every skill declares a licence in its own frontmatter, and all seven were
  // still on MIT after the relicense. They ship in the package and the host
  // reads them, so they are not documentation — they are declarations.
  for (const dir of fs.readdirSync(path.join(ROOT, 'skills'))) {
    const rel = `skills/${dir}/SKILL.md`;
    const m = /^license:\s*(\S+)\s*$/m.exec(read(rel));
    if (!m) continue;
    assert.strictEqual(m[1], spdx, `${rel} declares ${m[1]} but the package is ${spdx}`);
  }
  // A licence name is fine in prose about history; it is not fine as the answer
  // to "what is this licensed under", which is what a link to LICENSE means.
  for (const m of readme.matchAll(/\[([^\]]+)\]\(LICENSE\)/g)) {
    const named = m[1].trim();
    assert.ok(!OTHER.includes(named),
      `README links "${named}" to LICENSE, but the package is ${spdx}`);
  }
});

test('bin paths carry no "./" prefix', () => {
  // npm rewrites "./bin/x.js" to "bin/x.js" on publish and warns about it on
  // every release: `"bin[witness]" script name bin/witness-scan.js was invalid
  // and removed`. The package works either way — the published manifest is the
  // corrected one — but a warning nobody can act on trains you to skip the
  // publish log, which is where the real failures are printed.
  for (const [name, rel] of Object.entries(json('package.json').bin)) {
    assert.ok(!rel.startsWith('./'), `bin "${name}" is "${rel}"; npm rewrites it and warns. Drop the "./".`);
  }
});

test('a scoped package declares a bin matching the name after the scope', () => {
  // `npx @scope/name` resolves the bin called `name`. Without it, npx on a
  // scoped package either guesses or fails, and every npx line in the docs breaks.
  const pkg = json('package.json');
  const m = pkg.name.match(/^@[^/]+\/(.+)$/);
  if (!m) return;
  assert.ok(pkg.bin[m[1]], `scoped package ${pkg.name} must declare a bin named "${m[1]}" for npx to resolve it`);
});

test('publishConfig is set for a public scoped package with provenance', () => {
  const { publishConfig, name } = json('package.json');
  if (name.startsWith('@')) {
    assert.strictEqual(publishConfig.access, 'public', 'a scoped package defaults to restricted without this');
  }
  assert.strictEqual(publishConfig.provenance, true,
    'npm docs say provenance is automatic under OIDC, but in practice it needs to be requested');
});

test('every file listed in package.json files[] exists', () => {
  for (const entry of json('package.json').files) {
    assert.ok(fs.existsSync(path.join(ROOT, entry.replace(/\/$/, ''))), `files[] lists a missing path: ${entry}`);
  }
});

test('the published package has no runtime dependencies', () => {
  const pkg = json('package.json');
  assert.ok(!pkg.dependencies || !Object.keys(pkg.dependencies).length,
    'zero runtime dependencies is a design constraint, see CONTRIBUTING.md');
});

test('the action points at a bin that ships in the repo', () => {
  const action = read('action.yml');
  for (const m of action.matchAll(/GITHUB_ACTION_PATH\}\/([^"\s]+)/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, m[1])), `action.yml references a missing file: ${m[1]}`);
  }
});

test('hook scripts referenced by the manifests all exist', () => {
  for (const manifest of ['hooks/claude-hooks.json', 'hooks/copilot-hooks.json']) {
    const text = read(manifest);
    for (const m of text.matchAll(/hooks\/(witness-[\w-]+\.js)/g)) {
      assert.ok(fs.existsSync(path.join(ROOT, 'hooks', m[1])), `${manifest} references a missing hook: ${m[1]}`);
    }
  }
});
