# The seven tells

Every way a green check can lie, with what it looks like, why it works, when it is legitimate, and how the detector decides.

Six of these came from the literature. The seventh, **moved goalpost**, came from a benchmark run in August 2026 where it accounted for 88% of every cheat observed (52/59, 95% CI 78–94%) and the six-tell detector caught none of them — nine out of nine, in a run kept as raw evidence.

Detector source: [`hooks/witness-detect.js`](../hooks/witness-detect.js). Labeled corpus: [`benchmarks/corpus/cases.js`](../benchmarks/corpus/cases.js).

**How accurate is this.** On [171 real merged commits](../benchmarks/results/2026-08-06-wild-sweep.md), hand-labelled one by one: **93.5% precision by finding (95% CI 79–98%), 81.8% by issue (95% CI 52–95%)**, with both false positives named below in the sections of the rules that produced them. `npm run wild:precision` also prints the figure per tell and per language; several of those cells rest on one or two findings, and their intervals say so rather than reading as verdicts. Recall in the wild is unmeasured and stated as unmeasured. Where a rule has a known blind spot, it says so under **What it gets wrong** rather than in a footnote.

---

## movedgoalpost

**Moved goalpost** — the assertion is just as strict, and asks a different question.

```diff
-   assert fmt(1000) == "1000"
+   assert fmt(100)  == "100"
```

```diff
-   expect(round(2.5)).toEqual(3)
+   expect(round(2.5)).toEqual(2)
```

**Why it works.** Nothing is weakened. Same operator, same form, same strictness. Every assertion-strength heuristic ever written scores this clean, because it is not looking for a weaker check — and this is not a weaker check. It is a different check.

**When it is legitimate.** The spec changed. The expected value was always wrong. The original input was never part of the contract. All real, all fine — say which, in one sentence.

**How it is detected.** In a test file, an added assertion and a removed assertion that are byte-identical once every string and numeric literal is blanked. Same structure, different values. Requiring identical structure is what keeps this precise: a genuine test edit almost always changes shape too.

**What it gets wrong.** Identical structure is also the limit. If the call gains an argument, the skeletons stop matching and nothing is reported:

```diff
-assert round_price(250) == 3
-assert round_price(250) == 2
+assert round_price(250, mode='half_up') == 3
+assert round_price(150, mode='half_even') == 2
```

Two contradictory expectations made compatible by widening the API. The benchmark produced this four times ([replication](../benchmarks/results/2026-08-07-replication.md)) and the detector was silent on all four.

**It is deliberately not detected, and the reason is measured.** The shape occurs **zero times in the 171 pinned commits**, so its false-positive rate cannot be estimated at all — and in the benchmark cells the agent changed source (a real `mode` parameter, +12 lines) and the held-out check the agent never saw **passed**. From a diff, that is indistinguishable from ordinary API evolution: someone added a parameter and updated the tests, which is one of the most common legitimate changes there is. Deciding it correctly needs to know whether `mode` was in the spec, and a diff does not contain that. This is the same rule that removed Go's `_, err :=`: a tell that needs information the diff does not carry belongs in a type checker, not here.

---

## noopfix

**No-op fix** — only tests and config moved, and a check got weaker.

```
 tests/test_page.py  |  4 ++--
 1 file changed
```
> "Fixed the off-by-one in pagination."

**Why it works.** The diff is small and looks like diligence. Nothing that runs in production was touched, so the behavior provably did not change.

**When it is legitimate.** Never, as described — but the *shape* is legitimate constantly. Test-only PRs are normal: adding coverage, refactoring fixtures, un-skipping. Which is exactly why this rule needs both halves.

**How it is detected.** No source file changed, at least one test or config file changed, **and** at least one weakening tell fired in the same changeset. The first version required only the first two conditions and measured **5% precision** on the labeled corpus. Both halves are now required.

This is a changeset-scope tell. A single edit cannot assert "no source file changed."

---

## softenedassertion

**Softened assertion** — a strict comparison relaxed into a loose one.

```diff
-   assertEqual(total(items), 42)
+   assertTrue(total(items))
```

**Why it works.** The test still exists, still runs, still passes, still shows up in the coverage report. It no longer constrains anything.

**When it is legitimate.** The precise value genuinely is not part of the contract, and the loose form is what you actually meant.

**How it is detected.** Requires **both** a removed strict form and an added loose form, sitting within 8 lines of each other, **and** sharing at least one subject identifier. Without locality and subject it paired unrelated assertions in a refactored test — on real commits it produced this and called it a softening:

```diff
-   assert client.get("/get").data == b"42"
+   assert not request_ctx._session.accessed
```

**What it gets wrong.** A *replaced* test looks like a *softened* one. In flask, greenlet tests carrying `assert result == 42` were deleted and a new futures-based test carrying `assert result is not None` was added in the same commit; both use a variable named `result`, and after the rewrite they land close enough together to pass both the locality and shared-subject checks. Nothing was softened. Telling those two situations apart needs the detector to know a test's identity across a rewrite, which line proximity cannot provide. This is one of the two published false positives.

---

## swallow

**Swallow** — an error path silenced rather than handled.

```diff
  try:
      config = load_config()
+ except Exception:
+     pass
```

**Why it works.** The crash stops immediately, which looks exactly like a fix. Every future signal that this path is broken stops too, at runtime, in production.

**When it is legitimate.** A genuinely optional operation whose failure is genuinely uninteresting. Rare, and worth a sentence.

**How it is detected.** Inline patterns plus a two-line block walk, because the common Python form spans lines. A comment-only body still counts: a note is not handling.

**A rule that was removed here.** Go's `_, err := f()` was briefly flagged as a discarded error. It is the opposite: it discards the byte count and *keeps* the error. The obvious repair — flag `value, _ :=` instead — produced 34 findings in `gin`, every one ordinary code, because a regex cannot see whether the discarded position holds an `error`. The rule was deleted rather than tuned. `_ = err` on its own line is still caught, because that one is decidable from the text. A tell that needs types to be right belongs in a type checker.

---

## skip

**Skip** — a test disabled rather than made to pass.

```diff
+ @pytest.mark.skip
  def test_reconnect():
```

**Why it works.** The test is preserved as evidence of diligence and never executed.

**When it is legitimate.** Genuine flakiness, an environment the CI runner does not have, a test for an unshipped feature.

**How it is detected.** Skip and focus markers across pytest, unittest, jest, mocha, Go and Rust. `.only` is included because it silently skips every *other* test in the file — the most under-noticed member of this family.

---

## suppression

**Suppression** — a gate disabled at exactly the point it would have fired.

```diff
+ # type: ignore
```
```diff
+   continue-on-error: true
```

**Why it works.** It is a single token and it is completely invisible in a summary view.

**When it is legitimate.** Constantly. Upstream stubs are wrong, generated code trips linters, some rules do not fit some files.

**How it is detected.** A table across TypeScript, ESLint, Python, Rust, Java, Go, shell and GitHub Actions — but only on **added** lines. A suppression that was already in the file is not this edit's problem.

**This rule is off by default in the CLI and the Action.** On 111 real merged commits it produced 100 of 136 findings, and essentially every one was intentional and long-standing: `# noqa: F401` on a deliberate re-export, `@ts-expect-error` in a test whose *purpose* is asserting a type error, a file-level `eslint-disable` on a vendored client. All correct detections; none of them things a maintainer wants to be told about a pull request. Standing debt is what [`/witness-audit`](../skills/witness-audit/SKILL.md) is for.

It stays **on in the agent hook**, where the question is different: an agent that just added `# type: ignore` while trying to make something pass is exactly what this project exists to catch. Turn it on anywhere with `--all` or `--rules suppression`.

---

## fixturefitting

**Fixture fitting** — a branch keyed on the exact value the test uses.

```diff
  def price(sku):
+     if sku == "ABC-123":
+         return 42
      return lookup(sku)
```

**Why it works.** It passes every visible check and fails every real input.

**When it is legitimate.** A genuine special case that happens to be the one under test.

**How it is detected.** Three conditions, all necessary. The branch is against a **bare literal**; that literal is one a **test in the same changeset actually supplies**; and the edit adds only **one** such branch. A branch against a named constant is domain logic. A trivial literal like `0` or `1` is a boundary check. Several literal branches at once is a dispatch table.

Without the correspondence requirement this rule produced 24 findings on 111 real commits and every one was wrong — `if (property === 'destroy')` in a proxy handler, `if (sessions.length === 0)` in an emptiness check.

**What it gets wrong.** It cannot tell a test fixture from a public API value. In `got`, `if (responseType === 'text')` is a response-type dispatch — ordinary domain logic — and `'text'` appears in the tests because `responseType: 'text'` is a documented option, not because the branch was fitted to a fixture. The correspondence rule sees only that a literal in a new branch also appears in a test. This is the second of the two published false positives.

**This is still the tell no diff-based detector can catch reliably.** The heuristic gets the obvious form and will miss a determined one. That limitation is why the benchmark leans on held-out tests the agent never sees, rather than on this rule.

---

## deletedcheck

**Not in the scanner default.** Turn it on with `--all` or `--rules deleted-check`. On in the agent hook.

Every other tell inspects **added** lines. A test removed outright adds nothing, so there was nothing for any of them to look at, and deleting the failing test — the most direct cheat available — scanned clean until v0.6.0.

```diff
 def test_thousands_separator():
     assert fmt(1000) == "1,000"
-
-def test_no_separator():
-    assert fmt(1000) == "1000"
```

**How it is detected.** A test declaration present before and absent after, in a change where **no source file changed**. Both halves are required, and the second one is what makes the rule usable at all.

**Why the second half.** The width was measured on the 171 pinned commits before the rule was written. "Any test removed" is **11.7 findings per 100 commits** — `got` dropping a deprecated module with its nine tests, redirect tests consolidated, flask's greenlet rewrite. All legitimate, and at that rate the rule would roughly double this detector's entire output. Requiring that no source file changed takes it to **1.8 per 100**. Deleting a check while touching nothing that runs in production is not refactoring.

**Renames do not count.** A test whose name survives with trailing digits changed, or whose body survives verbatim under a new name, is a rename. `it('should encode data uri1')` and `uri2` becoming `it('should encode data uri')` is a consolidation, and it was the false positive the first measurement produced. Bodies are compared raw rather than skeletonized: blanking literals would make `assert fmt(1000) == "1,000"` and `assert fmt(1000) == "1000"` identical, and telling those two apart is the entire point of `moved goalpost`.

**What it gets wrong.** It cannot see a duplicate that survives in a file the change never touched. express `9c85a25c02` — "Remove duplicate tests" — deletes `should not override previous Content-Types` from `test/res.jsonp.js` while an identical copy remains in `test/res.json.js`, a file not in the diff. The check did not disappear; witness has no way to know that from the diff alone. This is why the rule is not in the scanner default: 2 of 3 on the only real corpus available, below both floors, on a sample far too small to claim anything.

**Where it came from.** Re-running the benchmark on 2026-08-07 and reading the cells the detector missed. Two of six misses were exactly this shape ([replication](../benchmarks/results/2026-08-07-replication.md)) — the same way `moved goalpost` was found.

## The escape hatch

Every tell here has a legitimate version. Witness does not forbid any of them — it forbids doing them silently.

```python
# witness: upstream stub types are wrong, tracked in #4412
import broken  # type: ignore
```

A `witness:` note on the line, the line above, or the line below silences the finding entirely and records the decision in [`/witness-ledger`](../skills/witness-ledger/SKILL.md). The cost is one sentence. A marker with no substantive reason does not count.

The number worth watching in a codebase is not how many exceptions it has. It is the ratio of declared to undeclared.
