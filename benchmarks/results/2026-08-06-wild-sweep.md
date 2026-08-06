# 2026-08-06 — the wild sweep

The labeled corpus answers *does the detector do what I intended*. It cannot answer *what does this do to somebody else's repository*, because the same person wrote the detector and the cases.

This is that second question. 171 real merged commits from five projects that have never heard of witness: `requests`, `flask`, `got`, `express`, `gin`.

Three rounds happened in one day. All three are kept here, because the first two are how the third one got its numbers.

| | v0.2.2 | v0.3.0 | **v0.4.0** |
| --- | ---: | ---: | ---: |
| commits scanned | 111 | 171 | **171** |
| findings | 136 | 35 | **31** |
| findings per 100 commits | 122 | 20.5 | **18.1** |
| issues per 100 commits | — | 11.1 | **6.4** |
| finding precision | — | — | **93.5%** (29/31) |
| issue precision | — | — | **81.8%** (9/11) |
| commits pinned | no | no | **yes** |

## Round one — 136 findings, and what they actually were

| tell | n | what it actually was |
| --- | ---: | --- |
| suppression | 100 | every one a genuine suppression. `# noqa: F401` on an intentional re-export, `@ts-expect-error` in a test whose *purpose* is asserting a type error, a file-level `eslint-disable` on a vendored client. Correct detections, useless advice. |
| fixture fitting | 24 | almost all wrong. `if (property === 'destroy')` in a proxy handler, `if (sessions.length === 0)` in an emptiness check. |
| swallow | 5 | correct |
| moved goalpost | 3 | real check-expectation changes |
| softened assertion | 3 | **a bug** — the matcher paired any removed strict assertion with any added loose one anywhere in the same file |

More than one finding per commit. At that rate the tool gets muted in week one, however defensible each finding is on its own.

**`suppression` left the default rule set.** It was 100 of 136 findings. It is a correct detector answering the wrong question on a pull request: standing debt is what `/witness-audit` is for. Still on in the agent hook, where an agent adding `# type: ignore` mid-fix is exactly the case this project exists to catch, and available anywhere via `--all`.

**`fixture fitting` now requires a real correspondence.** It used to fire on any new branch against a bare literal. It now requires the literal to be one the *test* supplies, ignores trivial literals like `0` and `1`, and stays quiet when several literal branches arrive together, because that is a dispatch table rather than a special case fitted to one fixture.

**`softened assertion` requires locality and a shared subject.** The removed strict form and the added loose form must sit within 8 lines of each other and mention at least one identifier in common. Without that it produced this, from flask, and called it a softening:

```diff
-   assert client.get("/get").data == b"42"
+   assert not request_ctx._session.accessed
```

## Round two — reading all 35 by hand

Reading every remaining finding against its actual diff found two more real bugs.

**A test *name* is not an assertion.** `it('should encode data uri1')` renamed to `it('should encode data uri2')` was reported as a moved goalpost, because the word `should` appeared inside the string. Assertion detection now blanks string literals before looking for assertive verbs.

**Go's second return value is not always an error.** `_, err := io.Copy(...)` was reported as a discarded error; it discards the byte count and *keeps* the error. The obvious repair — flag `value, _ :=` instead — was worse: it produced 34 findings in `gin`, every one ordinary code, because a regex cannot see whether the discarded position is an `error`. **The rule was removed rather than patched.** A tell that cannot be decided from the text of a diff does not belong in a diff scanner, and `_ = err` on its own line is still caught.

That second one is in the corpus as a case whose label was deliberately *changed* to "expect nothing", with the reasoning written next to it, so a future contributor who thinks it looks like a miss finds the argument instead of just a red test.

**Grouping was under-collapsing.** One express commit changed `Content-Disposition` quoting and produced 17 individually correct `moved goalpost` findings across many test files — one decision. The grouper blanks literals so identical transformations collapse, but evidence strings are *truncated for display*, which cuts a literal in half and leaves the opening quote unclosed. Seventeen findings therefore grouped into seven "issues". Unterminated literals are now blanked too, and it groups into one. Issues per 100 commits fell from 11.1 to 6.4 without a single detector change — the earlier number was counting the same decision seven times.

## Round three — the actual numbers

Every one of the 31 findings now carries a hand-written verdict in [`benchmarks/wild-labels.json`](../wild-labels.json), with a reason attached to each:

```
  FINDING precision  93.5%   (29/31)
  ISSUE precision    81.8%   (9/11)
  recall             not computable here
```

**The two false positives, in the open:**

*flask `tests/test_reqctx.py:173` — softened assertion.* The greenlet tests were **deleted** (`assert result == 42`) and a new futures-based test was **added** (`assert result is not None`). Two different tests that both happen to use a variable named `result`, landing close enough after the rewrite to satisfy both the locality and shared-subject checks. Nothing was softened. Fixing it needs the detector to tell a rewritten test from a replaced one, which line proximity cannot do.

*got `source/as-promise/index.ts:251` — fixture fitting.* `if (responseType === 'text')` is a response-type dispatch, ordinary domain logic. `'text'` appears in the tests because `responseType: 'text'` is a documented public option, not because the branch was fitted to a fixture. The correspondence rule cannot tell a public API value from a test fixture.

Both are recorded rather than tuned away. Each one is a rule that would need to see something a diff does not contain.

**Why issue precision is lower than finding precision, and why that is expected.** The true positives cluster — seventeen sites, one decision — while the false positives are singletons. Grouping compresses the wins harder than the losses. Both numbers are published for exactly that reason; quoting only the flattering one would be the thing this project is about.

## Honest reading

**There is no recall number here, and there cannot be one without more work.** Recall in the wild would mean reading all 171 commits by hand and deciding what witness *should* have said. Nobody has done that. The 98% recall figure this project quotes comes from the labeled corpus and from the benchmark's agent-modified checks — both synthetic, both written by the same person as the detector. Anyone quoting a wild recall number for a tool in this space, this one included, is guessing.

**One rater, and the rater maintains the tool.** That is a real weakness. It is a smaller one than the synthetic corpus, where the same person wrote the cases *and* the detector, but it is not independence. Second opinions belong as pull requests against the labels file; disagreements are the point, and a flipped verdict is a good commit.

**The rate still matters more than the precision.** At 122 findings per 100 commits the tool was noise regardless of how defensible each finding was. At 6.4 issues per 100 commits — roughly one per sixteen commits — it is something a reviewer can actually read. Precision only becomes an interesting question once the volume is survivable.

`moved goalpost` is 21 of 31 findings, and every one is a genuine change to what a check expects. That is the tell this project contributed, and it is behaving.

## Reproduce

The sweep is **pinned**. [`benchmarks/wild-pins.json`](../wild-pins.json) records the exact upstream commit each repository is swept from, so these numbers are the same on any machine on any day — and the hand-labels stay attached to the findings they were written about.

```bash
npm run wild:clone                      # ~200MB of blob-filtered clones
npm run wild                            # the pinned sweep
npm run wild:precision                  # score it against the hand-labels
node benchmarks/wild.js --sample 15     # findings to judge yourself
node benchmarks/wild.js --all           # including suppression
node benchmarks/wild.js --head          # what upstream looks like today
```

`--head` deliberately produces different numbers: it sweeps whatever has been merged since the pin, which is useful for finding new failure modes and useless for comparison. Moving a pin is its own commit, and whatever it changes gets re-labelled.

CI runs the scorer on every pull request and fails on three things: precision below its floor, a finding with no verdict, or a verdict describing a finding that no longer occurs. The last two matter most — they are what stops the labels quietly drifting away from the detector.
