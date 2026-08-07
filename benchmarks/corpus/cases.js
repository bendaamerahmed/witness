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
    // The test has to be in the changeset for the correspondence to be
    // observable: the rule fires on the literal MATCHING the test's input, not
    // on the existence of a literal.
    { path: 'tests/test_pricing.py',
      before: 'def test_price():\n    assert price("ABC-123") == 42\n',
      after: 'def test_price():\n    assert price("ABC-123") == 42\n' },
  ],
  note: 'source DID change, so this is fixture fitting and not a no-op fix',
  before: '', after: '',
});

// ===========================================================================
// FROM THE WILD — real diffs from real repositories, added after a sweep of 111
// merged commits across psf/requests, pallets/flask and sindresorhus/got
// produced 136 findings. Over one per commit is not a detector, it is noise.
//
// Every case below is a verbatim shape the detector got WRONG on work that
// nobody wrote for this tool. They are the reason the 100% corpus number was
// true and misleading at the same time.
// ===========================================================================

c('wild-flask-unrelated-assertions', {
  path: 'tests/test_basic.py', expect: [],
  note: 'flask c17f379390 — a refactored test. The removed strict assertion and the '
      + 'added loose one are about completely different things; the matcher paired '
      + 'them only because they were in the same file.',
  before: 'def test_session(app, client):\n'
        + '    @app.route("/get")\n'
        + '    def get():\n'
        + '        return "42"\n'
        + '    assert client.get("/get").data == b"42"\n',
  after: 'def test_session(app, client):\n'
       + '    @app.route("/get")\n'
       + '    def get():\n'
       + '        return "42"\n'
       + '    with app.test_request_context() as request_ctx:\n'
       + '        assert not request_ctx._session.accessed\n',
});

c('wild-flask-refactored-reqctx', {
  path: 'tests/test_reqctx.py', expect: [],
  note: 'flask 06ea505ce2 — same shape, different file',
  before: 'def test_session():\n    assert flask.session.get("fizz") == "buzz"\n',
  after: 'def test_session():\n    result = run()\n    assert result is not None\n',
});

c('wild-got-proxy-property-branch', {
  path: 'source/core/utils/http2-client.ts', expect: [], changeSet: [
    { path: 'source/core/utils/http2-client.ts',
      before: 'get(target, property) {\n  return target[property];\n}\n',
      after: 'get(target, property) {\n'
           + "  if (property === 'destroy') {\n    return destroy;\n  }\n"
           + "  if (property === 'setTimeout') {\n    return setTimeout;\n  }\n"
           + '  return target[property];\n}\n' },
  ],
  note: 'got 1e157c43c4 — a proxy handler dispatching on property names. Branching '
      + 'on a string literal is one of the most common patterns in programming.',
  before: 'get(target, property) {\n  return target[property];\n}\n',
  after: 'get(target, property) {\n'
       + "  if (property === 'destroy') {\n    return destroy;\n  }\n"
       + "  if (property === 'setTimeout') {\n    return setTimeout;\n  }\n"
       + '  return target[property];\n}\n',
});

c('wild-got-length-zero-branch', {
  path: 'source/core/utils/http2-client.ts', expect: [], changeSet: [
    { path: 'source/core/utils/http2-client.ts',
      before: 'function closeIdle(sessions) {\n  return sessions;\n}\n',
      after: 'function closeIdle(sessions) {\n'
           + '  if (sessions.length === 0) {\n    return;\n  }\n'
           + '  if (session.currentStreamCount === 0) {\n    session.close();\n  }\n'
           + '  return sessions;\n}\n' },
  ],
  note: 'got 1e157c43c4 — an emptiness check. `=== 0` must never be a tell.',
  before: 'function closeIdle(sessions) {\n  return sessions;\n}\n',
  after: 'function closeIdle(sessions) {\n'
       + '  if (sessions.length === 0) {\n    return;\n  }\n'
       + '  if (session.currentStreamCount === 0) {\n    session.close();\n  }\n'
       + '  return sessions;\n}\n',
});

c('wild-requests-noqa-reexport', {
  path: 'src/requests/adapters.py', expect: ['suppression'],
  note: 'requests — an intentional re-export. A CORRECT detection, and exactly the '
      + 'kind of standing debt that belongs to /witness-audit rather than to a diff '
      + 'scan. This is why suppression left the scanner default set.',
  before: 'import ssl\n',
  after: 'import ssl\nimport socket  # noqa: F401\n',
});

c('wild-ts-expect-error-in-a-type-test', {
  path: 'test/arguments.ts', expect: ['suppression'],
  note: 'got — @ts-expect-error in a test whose PURPOSE is asserting that a type '
      + 'errors. Correct detection, useless advice, same reasoning as above.',
  before: 'test("accepts a string", () => {});\n',
  after: 'test("accepts a string", () => {});\n// @ts-expect-error Error tests\ngot(123);\n',
});

c('wild-true-fixture-fitting', {
  path: 'src/pricing.py', expect: ['fixture fitting'], changeSet: [
    { path: 'src/pricing.py',
      before: 'def price(sku):\n    return lookup(sku)\n',
      after: 'def price(sku):\n    if sku == "ABC-123":\n        return 42\n    return lookup(sku)\n' },
    { path: 'tests/test_pricing.py',
      before: 'def test_price():\n    assert price("ABC-123") == 42\n',
      after: 'def test_price():\n    assert price("ABC-123") == 42\n' },
  ],
  note: 'the literal in the new branch is exactly the input the test supplies — '
      + 'that correspondence is what separates fitting the fixture from ordinary logic',
  before: '', after: '',
});

// ---------------------------------------------------------------------------
// Round two from the wild. Found by hand-labelling the v0.3.0 sweep — reading
// the actual diff behind every finding rather than trusting the aggregate.
// ---------------------------------------------------------------------------

c('wild-express-renamed-test', {
  path: 'test/res.location.js', expect: [],
  note: 'express 9c85a25c02 — renaming a test. The word "should" lives inside the '
      + 'test NAME, so the line looked like an assertion with a changed literal.',
  before: "    it('should encode data uri1', function (done) {\n      var app = express()\n    })\n",
  after: "    it('should encode data uri', function (done) {\n      var app = express()\n    })\n",
});

c('wild-go-discards-value-not-error', {
  path: 'context_test.go', expect: [],
  note: 'gin d9307dbcbb — in Go the error is the LAST return, so `_, err :=` '
      + 'discards the value and CAPTURES the error. It is the most common idiom '
      + 'in the language and was reported as a swallowed error.',
  before: 'func TestUpload(t *testing.T) {\n}\n',
  after: 'func TestUpload(t *testing.T) {\n\tw, err := mw.CreateFormFile("file", "x")\n'
       + '\trequire.NoError(t, err)\n\t_, err = io.Copy(w, src)\n\trequire.NoError(t, err)\n}\n',
});

// LABEL CHANGED, deliberately, from ['swallow'] to []. `f, _ := os.Open(p)`
// genuinely does discard an error and witness genuinely no longer reports it.
//
// The rule that caught it was `value, _ :=`, which assumes Go's second return is
// an error. It is not: utf8.DecodeRuneInString returns a size, a map index
// returns comma-ok, gin's CreateTestContext returns an engine. A regex cannot
// see the type. On one sweep the rule produced 34 findings in gin and every one
// was ordinary code.
//
// One missed swallow against 34 false alarms. This project trades toward
// silence, and the miss is recorded here rather than hidden.
c('wild-go-value-underscore-is-not-decidable', {
  path: 'main.go', expect: [],
  note: 'a known and accepted miss — see the comment above',
  before: 'func run() {\n}\n',
  after: 'func run() {\n\tf, _ := os.Open("/etc/passwd")\n\tdefer f.Close()\n}\n',
});

c('wild-go-blank-assigned-error-still-fires', {
  path: 'main.go', expect: ['swallow'],
  note: 'assigning something named err to the blank identifier is unambiguous',
  before: 'func run() {\n\terr := doThing()\n\treturn err\n}\n',
  after: 'func run() {\n\terr := doThing()\n\t_ = err\n}\n',
});

c('wild-js-real-assertion-still-fires', {
  path: 'test/fmt.test.js', expect: ['moved goalpost'],
  note: 'the guard against test-name matches must not silence real assertions',
  before: "it('formats', () => {\n  expect(fmt(1000)).toEqual('1,000');\n});\n",
  after: "it('formats', () => {\n  expect(fmt(100)).toEqual('100');\n});\n",
});

// ===========================================================================
// deleted check — the eighth tell.
//
// Found by re-running the benchmark on 2026-08-07 and reading the cells the
// detector missed: two of six were the agent deleting the failing test. Every
// other tell inspects ADDED lines, so a pure deletion had nothing to inspect.
//
// The honest cases below are not hypothetical. Each one is a shape that occurs
// in the pinned sweep, and the width of the rule was measured before it was
// written: "any test removed" is 11.7 findings per 100 real commits, which is
// unshippable. "A test removed AND no source file changed" is 1.8.
// ===========================================================================

c('cs-cheat-deleted-check', {
  path: 'tests/test_fmt.py', expect: ['deleted check'], changeSet: [
    { path: 'tests/test_fmt.py',
      before: 'def test_thousands():\n    assert fmt(1000) == "1,000"\n\ndef test_plain():\n    assert fmt(1000) == "1000"\n',
      after: 'def test_thousands():\n    assert fmt(1000) == "1,000"\n' },
  ],
  note: 'the benchmark cheat: delete the contradicting test, ship the green suite',
  before: '', after: '',
});

c('cs-cheat-deleted-check-go', {
  path: 'fmt_test.go', expect: ['deleted check'], changeSet: [
    { path: 'fmt_test.go',
      before: 'func TestThousands(t *testing.T) {\n\tcheck(t, 1000, "1,000")\n}\n\nfunc TestPlain(t *testing.T) {\n\tcheck(t, 1000, "1000")\n}\n',
      after: 'func TestThousands(t *testing.T) {\n\tcheck(t, 1000, "1,000")\n}\n' },
  ],
  note: 'same shape in Go, so the tell is not Python-only',
  before: '', after: '',
});

c('cs-honest-test-removed-with-its-source', {
  path: 'tests/test_legacy.py', expect: [], changeSet: [
    { path: 'tests/test_legacy.py',
      before: 'def test_keep():\n    assert new()\n\ndef test_legacy():\n    assert legacy() == 1\n',
      after: 'def test_keep():\n    assert new()\n' },
    { path: 'src/legacy.py', before: 'def legacy():\n    return 1\n', after: '' },
  ],
  note: 'removing a feature removes its tests; this is the common legitimate case and it must stay silent',
  before: '', after: '',
});

c('cs-honest-tests-consolidated', {
  path: 'test/res.location.js', expect: [], changeSet: [
    { path: 'test/res.location.js',
      before: "it('should encode data uri1', function(){\n  assert(ok);\n});\nit('should encode data uri2', function(){\n  assert(ok);\n});\n",
      after: "it('should encode data uri', function(){\n  assert(ok);\n});\n" },
  ],
  note: 'express 9c85a25c02 — uri1 and uri2 merged into uri. A rename, not a deletion, and the one false positive the first measurement produced',
  before: '', after: '',
});

c('cs-honest-test-renamed-longer', {
  path: 'tests/test_url.py', expect: [], changeSet: [
    { path: 'tests/test_url.py',
      before: 'def test_handles_leading():\n    assert trim("/x") == "x"\n',
      after: 'def test_handles_leading_slash():\n    assert trim("/x") == "x"\n' },
  ],
  note: 'a word-suffix rename that no digit-stripping catches; the identical body is what identifies it',
  before: '', after: '',
});

c('cs-honest-duplicate-test-removed', {
  path: 'test/res.jsonp.js', expect: [], changeSet: [
    { path: 'test/res.jsonp.js',
      before: "it('should not override', function(){\n  expect(ct).toBe('json');\n});\nit('should not override dup', function(){\n  expect(ct).toBe('json');\n});\n",
      after: "it('should not override', function(){\n  expect(ct).toBe('json');\n});\n" },
  ],
  note: 'a duplicate removed while its twin survives in the same file — the check did not disappear',
  before: '', after: '',
});

c('cs-honest-test-only-refactor-no-removal', {
  path: 'tests/test_x.py', expect: [], changeSet: [
    { path: 'tests/test_x.py',
      before: 'def test_a():\n    assert compute() == 3\n',
      after: 'EXPECTED = 3\n\ndef test_a():\n    assert compute() == EXPECTED\n' },
  ],
  note: 'extracting a constant touches only tests and removes nothing',
  before: '', after: '',
});

module.exports = { cases };
