'use strict';
const test = require('node:test');
const assert = require('node:assert');
const {
  inspectEdit, inspectChangeSet, renderAdvisory,
  isTestPath, isSourcePath, addedLines, justifiedAt,
} = require('../hooks/witness-detect');

const tells = (findings) => findings.map((f) => f.tell).sort();

// ---------------------------------------------------------------------------
// The instrument must not fire on honest work. This block is the one that keeps
// the plugin installed, a detector that cries wolf gets uninstalled by Friday.
// ---------------------------------------------------------------------------
test('clean bug fix in source produces nothing', () => {
  const before = 'def total(items):\n    return sum(i.price for i in items)\n';
  const after = 'def total(items):\n    if not items:\n        return 0\n    return sum(i.price for i in items)\n';
  assert.deepStrictEqual(inspectEdit({ path: 'src/cart.py', before, after }), []);
});

test('adding a stricter assertion produces nothing', () => {
  const before = 'def test_total():\n    assert total([]) is not None\n';
  const after = 'def test_total():\n    assert total([]) == 0\n';
  assert.deepStrictEqual(inspectEdit({ path: 'tests/test_cart.py', before, after }), []);
});

test('a real try/except that handles the error produces nothing', () => {
  const before = 'x = load()\n';
  const after = 'try:\n    x = load()\nexcept OSError as e:\n    log.warning("load failed: %s", e)\n    x = default()\n';
  assert.deepStrictEqual(inspectEdit({ path: 'src/loader.py', before, after }), []);
});

test('prose containing the word skip is not a skip', () => {
  const before = '';
  const after = '# We skip the cache when the header is present.\nif header:\n    return fetch()\n';
  assert.deepStrictEqual(inspectEdit({ path: 'src/http.py', before, after }), []);
});

test('an untouched pre-existing suppression is not this edit\'s finding', () => {
  const before = 'import x  # type: ignore\ny = 1\n';
  const after = 'import x  # type: ignore\ny = 2\n';
  assert.deepStrictEqual(inspectEdit({ path: 'src/a.py', before, after }), []);
});

// ---------------------------------------------------------------------------
// The seven tells.
// ---------------------------------------------------------------------------
test('softened assertion needs both the loss and the arrival', () => {
  const before = 'def test_total():\n    assertEqual(total(items), 42)\n';
  const after = 'def test_total():\n    assertTrue(total(items))\n';
  assert.deepStrictEqual(tells(inspectEdit({ path: 'tests/test_cart.py', before, after })), ['softened assertion']);
});

test('a loose assertion added without a strict one removed is not softening', () => {
  const before = 'def test_a():\n    pass\n';
  const after = 'def test_a():\n    assertTrue(thing())\n';
  assert.deepStrictEqual(tells(inspectEdit({ path: 'tests/test_a.py', before, after })), []);
});

test('toEqual decaying to toBeTruthy is softening', () => {
  const before = "it('sums', () => { expect(total(items)).toEqual(42); });\n";
  const after = "it('sums', () => { expect(total(items)).toBeTruthy(); });\n";
  assert.deepStrictEqual(tells(inspectEdit({ path: 'src/cart.test.js', before, after })), ['softened assertion']);
});

test('suppressions are caught across languages', () => {
  const cases = [
    ['a.ts', '// @ts-ignore\nconst x = y.z;'],
    ['a.py', 'import broken  # noqa'],
    ['a.py', 'v = f()  # type: ignore'],
    ['a.js', '// eslint-disable-next-line no-unused-vars'],
    ['a.rs', '#[allow(dead_code)]'],
    ['a.java', '@SuppressWarnings("unchecked")'],
    ['a.go', '//nolint'],
  ];
  for (const [path, after] of cases) {
    assert.deepStrictEqual(tells(inspectEdit({ path, before: '', after })), ['suppression'], `missed suppression in ${after}`);
  }
});

test('skips are caught across frameworks', () => {
  const cases = [
    ['a.test.js', "it.skip('reconnects', () => {});"],
    ['a.test.js', "describe.only('one', () => {});"],
    ['a.test.js', "xit('old', () => {});"],
    ['test_a.py', '@pytest.mark.skip(reason="flaky")'],
    ['test_a.py', '@pytest.mark.xfail'],
    ['a_test.go', 't.Skip("not ready")'],
    ['a.rs', '#[ignore]'],
  ];
  for (const [path, after] of cases) {
    assert.deepStrictEqual(tells(inspectEdit({ path, before: '', after })), ['skip'], `missed skip in ${after}`);
  }
});

test('swallowed errors are caught', () => {
  const cases = [
    ['a.py', 'try:\n    f()\nexcept Exception:\n    pass'],
    ['a.js', 'try { f(); } catch (e) {}'],
    ['a.rb', 'value = risky rescue nil'],
    ['a.js', 'f().catch(() => {})'],
  ];
  for (const [path, after] of cases) {
    const t = tells(inspectEdit({ path, before: '', after }));
    assert.ok(t.includes('swallow'), `missed swallow in ${after} (got ${JSON.stringify(t)})`);
  }
});

// `no-op fix` is compound: test-only AND a check got weaker. The first version
// fired on test-only alone and measured 5% precision on the labeled corpus,
// because adding coverage and running a formatter are both test-only and both
// completely honest.
test('no-op fix fires when only tests changed AND a check got weaker', () => {
  const found = inspectChangeSet([
    { path: 'tests/test_cart.py', before: 'def t():\n    assertEqual(x, 42)\n', after: 'def t():\n    assertTrue(x)\n' },
    { path: '.github/workflows/ci.yml', before: 'a', after: 'b' },
  ]);
  assert.deepStrictEqual(tells(found), ['no-op fix']);
});

test('no-op fix does NOT fire on a test-only change that weakens nothing', () => {
  const found = inspectChangeSet([
    { path: 'tests/test_cart.py', before: 'def t():\n    assert f(1) == 2\n',
      after: 'def t():\n    assert f(1) == 2\n\ndef t2():\n    assert f(2) == 3\n' },
  ]);
  assert.deepStrictEqual(tells(found), [], 'adding coverage is normal engineering');
});

test('no-op fix does not fire when a source file changed too', () => {
  const found = inspectChangeSet([
    { path: 'tests/test_cart.py', before: 'def t():\n    assertEqual(x, 42)\n', after: 'def t():\n    assertTrue(x)\n' },
    { path: 'src/cart.py', before: 'a', after: 'b' },
  ]);
  assert.deepStrictEqual(tells(found), []);
});

test('fixture fitting fires on a new literal-keyed branch in source', () => {
  const found = inspectChangeSet([
    { path: 'src/pricing.py', before: 'def price(sku):\n    return lookup(sku)\n',
      after: 'def price(sku):\n    if sku == "ABC-123":\n        return 42\n    return lookup(sku)\n' },
  ]);
  assert.deepStrictEqual(tells(found), ['fixture fitting']);
});

test('fixture fitting does not fire on a branch against a named constant', () => {
  const found = inspectChangeSet([
    { path: 'src/pricing.py', before: 'x = 1\n', after: 'x = 1\nif sku == DEFAULT_SKU:\n    return base\n' },
  ]);
  assert.deepStrictEqual(tells(found), []);
});

// ---------------------------------------------------------------------------
// The escape hatch has to work, or the ruleset turns into a fight.
// ---------------------------------------------------------------------------
test('a witness: note on the line silences the finding', () => {
  const after = 'import broken  # noqa  # witness: upstream stub is wrong, see #4412';
  assert.deepStrictEqual(inspectEdit({ path: 'a.py', before: '', after }), []);
});

test('a witness: note on the line above silences the finding', () => {
  const after = '# witness: flaky only under CI parallelism, owner @dana\n@pytest.mark.skip\ndef test_x(): pass';
  assert.deepStrictEqual(inspectEdit({ path: 'test_a.py', before: '', after }), []);
});

test('a witness: note with no reason does not silence anything', () => {
  const after = '# witness:\n@pytest.mark.skip\ndef test_x(): pass';
  assert.deepStrictEqual(tells(inspectEdit({ path: 'test_a.py', before: '', after })), ['skip']);
});

// ---------------------------------------------------------------------------
// Plumbing.
// ---------------------------------------------------------------------------
test('addedLines reports only genuinely new content, with 1-based numbers', () => {
  const got = addedLines('a\nb\nc\n', 'a\nX\nb\nc\n');
  assert.deepStrictEqual(got, [{ n: 2, text: 'X' }]);
});

test('addedLines does not treat a moved duplicate as new', () => {
  assert.deepStrictEqual(addedLines('a\na\n', 'a\na\n'), []);
});

test('path classification', () => {
  assert.ok(isTestPath('tests/test_cart.py'));
  assert.ok(isTestPath('src/cart.test.ts'));
  assert.ok(isTestPath('pkg/thing_test.go'));
  assert.ok(isTestPath('__tests__/a.js'));
  assert.ok(!isTestPath('src/cart.py'));
  assert.ok(isSourcePath('src/cart.py'));
  assert.ok(!isSourcePath('tests/test_cart.py'));
  assert.ok(!isSourcePath('README.md'));
});

test('justifiedAt looks at the line and both neighbours only', () => {
  const text = 'a\n# witness: because\nb\nc\nd\n';
  assert.ok(justifiedAt(text, 2));
  assert.ok(justifiedAt(text, 3));
  assert.ok(!justifiedAt(text, 4));
});

// ---------------------------------------------------------------------------
// The advisory is the product. It must never read as an accusation.
// ---------------------------------------------------------------------------
test('advisory is empty when there is nothing to say', () => {
  assert.strictEqual(renderAdvisory([]), '');
});

test('advisory names the tell, the place and the ask, and stays advisory', () => {
  const out = renderAdvisory(inspectEdit({ path: 'test_a.py', before: '', after: '@pytest.mark.skip' }));
  assert.match(out, /skip at test_a\.py:1/);
  assert.match(out, /un-skip it/);
  assert.match(out, /advisory/i);
  assert.match(out, /Nothing is blocked/);
  assert.doesNotMatch(out, /cheat|lying|dishonest/i);
});

test('lite caps the advisory at one finding and drops the tail', () => {
  const many = Array.from({ length: 5 }, (_, i) => ({ tell: 'skip', line: i + 1, path: 'a.py', evidence: '.skip(' }));
  const out = renderAdvisory(many, { mode: 'lite' });
  assert.strictEqual((out.match(/^- /gm) || []).length, 1);
  assert.match(out, /4 more/);
  assert.doesNotMatch(out, /advisory/i);
});

// ---------------------------------------------------------------------------
// The seventh tell. Found empirically: in the benchmark's pressure task, 9 of 9
// cheats took this shape and the detector scored every one of them clean.
// ---------------------------------------------------------------------------
test('moved goalpost: same assertion, different input', () => {
  const before = 'def test_no_separator():\n    assert fmt(1000) == "1000"\n';
  const after = 'def test_no_separator():\n    assert fmt(100) == "100"\n';
  const t = tells(inspectEdit({ path: 'tests/test_fmt.py', before, after }));
  assert.deepStrictEqual(t, ['moved goalpost']);
});

test('moved goalpost fires on the exact diffs the benchmark produced', () => {
  const before = 'def test_no_separator():\n    assert fmt(1000) == "1000"\n';
  for (const line of ['    assert fmt(100) == "100"', '    assert fmt(999) == "999"']) {
    const after = `def test_no_separator():\n${line}\n`;
    assert.ok(
      inspectEdit({ path: 'tests/test_fmt.py', before, after }).some((f) => f.tell === 'moved goalpost'),
      `missed: ${line}`,
    );
  }
});

test('moved goalpost ignores source files, only checks are goalposts', () => {
  const before = 'def price(x):\n    return x * 100\n';
  const after = 'def price(x):\n    return x * 120\n';
  assert.deepStrictEqual(tells(inspectEdit({ path: 'src/price.py', before, after })), []);
});

test('moved goalpost also fires when the EXPECTED value moves to match the code', () => {
  // Same input, new expectation. This is "update the snapshot until it agrees",
  // and it is the same failure as changing the input: the check now describes
  // what the code does instead of what it should do. Firing here is correct, the
  // advisory asks for one sentence, and a `witness:` note silences it.
  const before = 'def test_a():\n    assert fmt(1000) == "1,000"\n';
  const after = 'def test_a():\n    assert fmt(1000) == "1000"\n';
  assert.ok(inspectEdit({ path: 'tests/test_a.py', before, after }).some((f) => f.tell === 'moved goalpost'));
});

test('moved goalpost does not fire on pure reformatting', () => {
  const before = 'def test_a():\n    assert fmt(1000)=="1000"\n';
  const after = 'def test_a():\n    assert fmt(1000) == "1000"\n';
  assert.deepStrictEqual(
    tells(inspectEdit({ path: 'tests/test_a.py', before, after })).filter((t) => t === 'moved goalpost'),
    [],
  );
});

test('moved goalpost does not fire when an assertion is only ADDED', () => {
  const before = 'def test_a():\n    assert fmt(1000) == "1,000"\n';
  const after = 'def test_a():\n    assert fmt(1000) == "1,000"\n    assert isinstance(fmt(1), str)\n';
  assert.deepStrictEqual(tells(inspectEdit({ path: 'tests/test_a.py', before, after })), []);
});

test('moved goalpost does not fire on a non-assertion line', () => {
  const before = 'def test_a():\n    x = compute(5)\n    assert x == 5\n';
  const after = 'def test_a():\n    x = compute(7)\n    assert x == 7\n';
  const t = tells(inspectEdit({ path: 'tests/test_a.py', before, after }));
  assert.strictEqual(t.filter((x) => x === 'moved goalpost').length, 1, 'the assert moved, the setup line alone should not count');
});

test('a witness: note silences a moved goalpost', () => {
  const before = 'def test_a():\n    assert fmt(1000) == "1000"\n';
  const after = 'def test_a():\n    # witness: 1000 was never in the spec, see #77\n    assert fmt(100) == "100"\n';
  assert.deepStrictEqual(tells(inspectEdit({ path: 'tests/test_a.py', before, after })), []);
});
