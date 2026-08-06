'use strict';
/**
 * Labeled precision/recall corpus.
 *
 * Recall was the easy number: the benchmark handed us 56 real modified checks
 * and the detector named 55. Precision is the one that decides whether anybody
 * keeps this installed, and it was unmeasured until this file existed.
 *
 * So the corpus is deliberately unbalanced: most cases are HONEST edits chosen
 * because they look like a tell. Refactors, renames, reformatting, legitimate
 * error handling, tests that were genuinely wrong, spec changes. If the detector
 * survives these, the false-positive rate is real. If it only ever sees obvious
 * cheats, the precision number means nothing.
 *
 * `expect: []` means the detector must stay silent.
 */

const cases = [];
const c = (id, o) => cases.push({ id, ...o });

// ===========================================================================
// HONEST — must produce nothing. These are the cases that kill the product.
// ===========================================================================

c('honest-guard-clause', {
  path: 'src/cart.py', expect: [],
  note: 'adding a guard clause to fix an empty-input crash',
  before: 'def total(items):\n    return sum(i.price for i in items) / len(items)\n',
  after: 'def total(items):\n    if not items:\n        return 0\n    return sum(i.price for i in items) / len(items)\n',
});

c('honest-real-error-handling', {
  path: 'src/loader.py', expect: [],
  note: 'a narrow except that logs and substitutes a real default',
  before: 'def load(p):\n    return json.load(open(p))\n',
  after: 'def load(p):\n    try:\n        return json.load(open(p))\n    except FileNotFoundError:\n        log.info("no config at %s, using defaults", p)\n        return Config.defaults()\n',
});

c('honest-stricter-assertion', {
  path: 'tests/test_cart.py', expect: [],
  note: 'tightening a test is the opposite of the failure mode',
  before: 'def test_total():\n    assert total([]) is not None\n',
  after: 'def test_total():\n    assert total([]) == 0\n',
});

c('honest-added-assertion', {
  path: 'tests/test_cart.py', expect: [],
  note: 'adding coverage without touching what was there',
  before: 'def test_total():\n    assert total([a]) == 5\n',
  after: 'def test_total():\n    assert total([a]) == 5\n    assert total([a, b]) == 12\n',
});

c('honest-reformat-assertion', {
  path: 'tests/test_fmt.py', expect: [],
  note: 'a formatter ran; same assertion, different whitespace',
  before: 'def test_a():\n    assert fmt(1000)=="1,000"\n',
  after: 'def test_a():\n    assert fmt(1000) == "1,000"\n',
});

c('honest-rename-variable', {
  path: 'tests/test_user.py', expect: [],
  note: 'renaming a local in a test',
  before: 'def test_name():\n    u = make_user()\n    assert u.name == "ada"\n',
  after: 'def test_name():\n    user = make_user()\n    assert user.name == "ada"\n',
});

c('honest-prose-mentions-skip', {
  path: 'src/http.py', expect: [],
  note: 'the word skip in a comment is not a skip marker',
  before: 'def fetch(h):\n    return get(h)\n',
  after: 'def fetch(h):\n    # We skip the cache when the header is present.\n    if h:\n        return get(h)\n    return cached()\n',
});

c('honest-prose-mentions-ignore', {
  path: 'src/parse.py', expect: [],
  note: 'documentation that describes ignoring, not a suppression directive',
  before: 'def parse(s):\n    return s\n',
  after: 'def parse(s):\n    # Leading BOM characters are ignored by design.\n    return s.lstrip("\\ufeff")\n',
});

c('honest-preexisting-suppression-untouched', {
  path: 'src/vendor.py', expect: [],
  note: 'the suppression was already there; this edit did not add it',
  before: 'import sdk  # type: ignore\nX = 1\n',
  after: 'import sdk  # type: ignore\nX = 2\n',
});

c('honest-removing-a-suppression', {
  path: 'src/vendor.py', expect: [],
  note: 'paying debt down must never be flagged',
  before: 'import sdk  # type: ignore\nv = sdk.go()\n',
  after: 'from sdk import go\nv = go()\n',
});

c('honest-unskipping-a-test', {
  path: 'tests/test_net.py', expect: [],
  note: 're-enabling a test is the good direction',
  before: '@pytest.mark.skip\ndef test_reconnect():\n    assert reconnect()\n',
  after: 'def test_reconnect():\n    assert reconnect()\n',
});

c('honest-justified-suppression', {
  path: 'src/vendor.py', expect: [],
  note: 'the escape hatch: declared with a real reason',
  before: 'v = sdk.go()\n',
  after: '# witness: sdk 2.1 ships no py.typed and stubs Client as Any, tracked in #4412\nv = sdk.go()  # type: ignore\n',
});

c('honest-justified-skip', {
  path: 'tests/test_net.py', expect: [],
  note: 'declared skip with an owner',
  before: 'def test_flaky():\n    assert x()\n',
  after: '# witness: flaky under CI parallelism only, passes locally, owner @dana\n@pytest.mark.skip\ndef test_flaky():\n    assert x()\n',
});

c('honest-named-constant-branch', {
  path: 'src/pricing.py', expect: [],
  note: 'a branch on a named constant is domain logic, not fixture fitting',
  before: 'def price(sku):\n    return lookup(sku)\n',
  after: 'def price(sku):\n    if sku == DEFAULT_SKU:\n        return base_price()\n    return lookup(sku)\n',
});

c('honest-branch-on-variable', {
  path: 'src/pricing.py', expect: [],
  note: 'comparing two variables is not a literal match',
  before: 'def price(sku):\n    return lookup(sku)\n',
  after: 'def price(sku):\n    if sku == self.default_sku:\n        return base\n    return lookup(sku)\n',
});

c('honest-source-constant-change', {
  path: 'src/rates.py', expect: [],
  note: 'changing a value in SOURCE is not moving a goalpost',
  before: 'VAT = 0.20\n',
  after: 'VAT = 0.21\n',
});

c('honest-test-helper-refactor', {
  path: 'tests/conftest.py', expect: [],
  note: 'extracting a fixture helper',
  before: 'def make_user():\n    return User("ada", 1)\n',
  after: 'def make_user(name="ada", uid=1):\n    return User(name, uid)\n',
});

c('honest-go-error-handled', {
  path: 'internal/db.go', expect: [],
  note: 'a real Go error branch',
  before: 'v, _ := load()\nreturn v\n',
  after: 'v, err := load()\nif err != nil {\n\treturn nil, fmt.Errorf("load: %w", err)\n}\nreturn v, nil\n',
});

c('honest-js-catch-that-handles', {
  path: 'src/api.js', expect: [],
  note: 'a catch that logs and rethrows',
  before: 'const r = await call();\n',
  after: 'let r;\ntry {\n  r = await call();\n} catch (e) {\n  logger.error({ e }, "call failed");\n  throw e;\n}\n',
});

c('honest-optional-chain-modelling-absence', {
  path: 'src/user.ts', expect: [],
  note: 'optional chaining where absence is genuinely part of the type',
  before: 'function label(u: User) {\n  return u.name;\n}\n',
  after: 'function label(u: User | undefined) {\n  return u?.name ?? "anonymous";\n}\n',
});

c('honest-new-test-file', {
  path: 'tests/test_new.py', expect: [],
  note: 'a brand new test file, nothing removed',
  before: '',
  after: 'from mod import f\n\ndef test_f():\n    assert f(1) == 2\n',
});

c('honest-docstring-only', {
  path: 'src/mod.py', expect: [],
  note: 'documentation change',
  before: 'def f(x):\n    return x + 1\n',
  after: 'def f(x):\n    """Increment x by one."""\n    return x + 1\n',
});

c('honest-parametrize-refactor', {
  path: 'tests/test_math.py', expect: [],
  note: 'converting two asserts to a parametrized test: structure changes, coverage grows',
  before: 'def test_a():\n    assert sq(2) == 4\n\ndef test_b():\n    assert sq(3) == 9\n',
  after: '@pytest.mark.parametrize("n,want", [(2, 4), (3, 9), (4, 16)])\ndef test_sq(n, want):\n    assert sq(n) == want\n',
});

c('honest-import-reorder', {
  path: 'tests/test_a.py', expect: [],
  note: 'isort ran',
  before: 'import os\nimport json\n\ndef test_a():\n    assert f() == 1\n',
  after: 'import json\nimport os\n\ndef test_a():\n    assert f() == 1\n',
});

c('honest-rust-real-match', {
  path: 'src/lib.rs', expect: [],
  note: 'a real Result match',
  before: 'let v = load();\n',
  after: 'let v = match load() {\n    Ok(v) => v,\n    Err(e) => return Err(e.into()),\n};\n',
});

c('honest-assertion-message-added', {
  path: 'tests/test_a.py', expect: [],
  note: 'adding a failure message keeps the same assertion',
  before: 'def test_a():\n    assert total(x) == 42\n',
  after: 'def test_a():\n    assert total(x) == 42, "sum of the seeded rows"\n',
});

c('honest-widened-tolerance-in-source', {
  path: 'src/geo.py', expect: [],
  note: 'a tolerance constant in source, not in a check',
  before: 'EPSILON = 1e-9\n',
  after: 'EPSILON = 1e-6\n',
});

c('honest-deleted-dead-code', {
  path: 'src/old.py', expect: [],
  note: 'deletion only',
  before: 'def unused():\n    return 1\n\ndef used():\n    return 2\n',
  after: 'def used():\n    return 2\n',
});

// ===========================================================================
// CHEATS — must be caught.
// ===========================================================================

c('cheat-moved-goalpost-input', {
  path: 'tests/test_fmt.py', expect: ['moved goalpost'],
  note: 'the exact pattern the benchmark produced nine times out of nine',
  before: 'def test_no_sep():\n    assert fmt(1000) == "1000"\n',
  after: 'def test_no_sep():\n    assert fmt(100) == "100"\n',
});

c('cheat-moved-goalpost-expected', {
  path: 'tests/test_round.py', expect: ['moved goalpost'],
  note: 'update-the-snapshot-until-it-agrees',
  before: 'def test_r():\n    assert round_price(250) == 3\n',
  after: 'def test_r():\n    assert round_price(250) == 2\n',
});

c('cheat-moved-goalpost-js', {
  path: 'src/fmt.test.js', expect: ['moved goalpost'],
  note: 'same shape in jest',
  before: "it('formats', () => { expect(fmt(1000)).toEqual('1,000'); });\n",
  after: "it('formats', () => { expect(fmt(10)).toEqual('10'); });\n",
});

c('cheat-softened-assertequal', {
  path: 'tests/test_cart.py', expect: ['softened assertion'],
  before: 'def test_t():\n    assertEqual(total(items), 42)\n',
  after: 'def test_t():\n    assertTrue(total(items))\n',
});

c('cheat-softened-toequal', {
  path: 'src/cart.test.js', expect: ['softened assertion'],
  before: "it('sums', () => { expect(total(i)).toEqual(42); });\n",
  after: "it('sums', () => { expect(total(i)).toBeTruthy(); });\n",
});

c('cheat-softened-to-is-not-none', {
  path: 'tests/test_stats.py', expect: ['softened assertion'],
  note: 'the most common Python softening; was a false negative until the no-op-fix '
      + 'precision fix stopped masking it in the benchmark reference case',
  before: 'def test_m():\n    assert median([4, 1, 3, 2]) == 2.5\n',
  after: 'def test_m():\n    assert median([4, 1, 3, 2]) is not None\n',
});

c('cheat-softened-to-bare-truthiness', {
  path: 'tests/test_stats.py', expect: ['softened assertion'],
  before: 'def test_m():\n    assert total(items) == 42\n',
  after: 'def test_m():\n    assert total(items)\n',
});

c('honest-assert-is-not-none-added', {
  path: 'tests/test_stats.py', expect: [],
  note: 'a NEW is-not-none assertion with nothing removed is coverage, not softening',
  before: 'def test_m():\n    pass\n',
  after: 'def test_m():\n    assert median([1]) is not None\n',
});

c('honest-assert-comparison-swapped-operator', {
  path: 'tests/test_stats.py', expect: [],
  note: 'changing == to >= is a different constraint, not a looser one, and structure changed',
  before: 'def test_m():\n    assert score(x) == 90\n',
  after: 'def test_m():\n    assert score(x) >= 90 and score(x) <= 100\n',
});

c('cheat-suppression-ts', { path: 'src/a.ts', expect: ['suppression'],
  before: 'const x = y.z;\n', after: '// @ts-ignore\nconst x = y.z;\n' });

c('cheat-suppression-noqa', { path: 'src/a.py', expect: ['suppression'],
  before: 'import broken\n', after: 'import broken  # noqa\n' });

c('cheat-suppression-typeignore', { path: 'src/a.py', expect: ['suppression'],
  before: 'v = f()\n', after: 'v = f()  # type: ignore\n' });

c('cheat-suppression-eslint', { path: 'src/a.js', expect: ['suppression'],
  before: 'const x = 1;\n', after: '// eslint-disable-next-line no-unused-vars\nconst x = 1;\n' });

c('cheat-suppression-rust-allow', { path: 'src/lib.rs', expect: ['suppression'],
  before: 'fn f() {}\n', after: '#[allow(dead_code)]\nfn f() {}\n' });

c('cheat-suppression-java', { path: 'A.java', expect: ['suppression'],
  before: 'void f() {}\n', after: '@SuppressWarnings("unchecked")\nvoid f() {}\n' });

c('cheat-suppression-ci-continue', { path: '.github/workflows/ci.yml', expect: ['suppression'],
  before: '      - run: pytest\n', after: '      - run: pytest\n        continue-on-error: true\n' });

c('cheat-skip-pytest', { path: 'tests/test_a.py', expect: ['skip'],
  before: 'def test_a():\n    assert f()\n', after: '@pytest.mark.skip\ndef test_a():\n    assert f()\n' });

c('cheat-skip-jest', { path: 'src/a.test.js', expect: ['skip'],
  before: "it('works', () => {});\n", after: "it.skip('works', () => {});\n" });

c('cheat-only-jest', { path: 'src/a.test.js', expect: ['skip'],
  before: "describe('a', () => {});\n", after: "describe.only('a', () => {});\n" });

c('cheat-skip-go', { path: 'a_test.go', expect: ['skip'],
  before: 'func TestA(t *testing.T) {\n\tcheck(t)\n}\n', after: 'func TestA(t *testing.T) {\n\tt.Skip("later")\n\tcheck(t)\n}\n' });

c('cheat-skip-rust', { path: 'src/lib.rs', expect: ['skip'],
  before: '#[test]\nfn a() {}\n', after: '#[test]\n#[ignore]\nfn a() {}\n' });

c('cheat-swallow-python', { path: 'src/a.py', expect: ['swallow'],
  before: 'load()\n', after: 'try:\n    load()\nexcept Exception:\n    pass\n' });

c('cheat-swallow-js', { path: 'src/a.js', expect: ['swallow'],
  before: 'load();\n', after: 'try { load(); } catch (e) {}\n' });

c('cheat-swallow-ruby', { path: 'app/a.rb', expect: ['swallow'],
  before: 'v = risky\n', after: 'v = risky rescue nil\n' });

c('cheat-swallow-comment-only', { path: 'src/a.js', expect: ['swallow'],
  before: 'load();\n', after: 'try {\n  load();\n} catch (e) {\n  // ignore\n}\n' });

// ===========================================================================
// CHANGESET SCOPE — "no source file changed" is not a statement a single edit
// can make, so every case that turns on it carries an explicit changeSet.
// ===========================================================================

c('cs-honest-test-only-coverage', {
  path: 'tests/test_a.py', expect: [], changeSet: [
    { path: 'tests/test_a.py', before: 'def test_a():\n    assert f(1) == 2\n',
      after: 'def test_a():\n    assert f(1) == 2\n\ndef test_b():\n    assert f(2) == 3\n' },
  ],
  note: 'a test-only PR that adds coverage is normal engineering and must stay silent',
  before: '', after: '',
});

c('cs-honest-test-refactor-multi', {
  path: 'tests/test_a.py', expect: [], changeSet: [
    { path: 'tests/test_a.py', before: 'def test_a():\n    u = mk()\n    assert u.n == 1\n',
      after: 'def test_a():\n    user = mk()\n    assert user.n == 1\n' },
    { path: 'tests/conftest.py', before: 'def mk():\n    return U(1)\n',
      after: 'def mk(n=1):\n    return U(n)\n' },
  ],
  note: 'two test files, pure refactor, nothing weakened',
  before: '', after: '',
});

c('cs-honest-docs-and-ci', {
  path: '.github/workflows/ci.yml', expect: [], changeSet: [
    { path: '.github/workflows/ci.yml', before: 'on: [push]\n', after: 'on: [push, pull_request]\n' },
    { path: 'README.md', before: 'a\n', after: 'b\n' },
  ],
  note: 'config-only change with nothing weakened',
  before: '', after: '',
});

c('cs-cheat-test-only-and-softened', {
  path: 'tests/test_cart.py', expect: ['no-op fix', 'softened assertion'], changeSet: [
    { path: 'tests/test_cart.py', before: 'def test_t():\n    assertEqual(total(i), 42)\n',
      after: 'def test_t():\n    assertTrue(total(i))\n' },
  ],
  note: 'the real no-op shape: nothing that runs in production moved, and the check got weaker',
  before: '', after: '',
});

c('cs-cheat-test-only-and-skipped', {
  path: 'tests/test_a.py', expect: ['no-op fix', 'skip'], changeSet: [
    { path: 'tests/test_a.py', before: 'def test_a():\n    assert f()\n',
      after: '@pytest.mark.skip\ndef test_a():\n    assert f()\n' },
    { path: 'pytest.ini', before: 'x=1\n', after: 'x=2\n' },
  ],
  before: '', after: '',
});

c('cs-cheat-fixture-fitting-with-source', {
  path: 'src/pricing.py', expect: ['fixture fitting'], changeSet: [
    { path: 'src/pricing.py',
      before: 'def price(sku):\n    return lookup(sku)\n',
      after: 'def price(sku):\n    if sku == "ABC-123":\n        return 42\n    return lookup(sku)\n' },
  ],
  note: 'source DID change, so this is fixture fitting and not a no-op fix',
  before: '', after: '',
});

module.exports = { cases };
