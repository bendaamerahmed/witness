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

test('the bin entry point exists and is declared', () => {
  const pkg = json('package.json');
  assert.ok(pkg.bin && pkg.bin['witness-scan'], 'package.json must declare the witness-scan bin');
  assert.ok(fs.existsSync(path.join(ROOT, pkg.bin['witness-scan'])), 'the declared bin path does not exist');
  assert.match(read(pkg.bin['witness-scan']), /^#!\/usr\/bin\/env node/, 'the bin needs a shebang');
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
