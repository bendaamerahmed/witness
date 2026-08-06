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

test('every declared bin exists and is executable as a script', () => {
  const pkg = json('package.json');
  assert.ok(pkg.bin && Object.keys(pkg.bin).length, 'package.json must declare at least one bin');
  for (const [name, rel] of Object.entries(pkg.bin)) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `bin "${name}" points at a missing file: ${rel}`);
    assert.match(read(rel), /^#!\/usr\/bin\/env node/, `bin "${name}" needs a shebang`);
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
