# 2026-08-06 — the wild sweep

The labeled corpus answers *does the detector do what I intended*. It cannot answer *what does this do to somebody else's repository*, because the same person wrote the detector and the cases.

This is that second question. 171 real merged commits from five projects that have never heard of witness.

## Before

The first sweep, on v0.2.2, produced **136 findings across 111 commits** — more than one per commit.

| tell | n | what it actually was |
| --- | ---: | --- |
| suppression | 100 | every one a genuine suppression. `# noqa: F401` on an intentional re-export, `@ts-expect-error` in a test whose *purpose* is asserting a type error, a file-level `eslint-disable` on a vendored client. Correct detections, useless advice. |
| fixture fitting | 24 | almost all wrong. `if (property === 'destroy')` in a proxy handler, `if (sessions.length === 0)` in an emptiness check. |
| swallow | 5 | correct |
| moved goalpost | 3 | real check-expectation changes |
| softened assertion | 3 | **a bug** — the matcher paired any removed strict assertion with any added loose one anywhere in the same file |

## After

| | before | after |
| --- | ---: | ---: |
| commits scanned | 111 | 171 |
| findings | 136 | 35 |
| findings per 100 commits | 122 | 20.5 |
| **issues per 100 commits** | — | **11.1** |

```
  moved goalpost         22
  swallow                7
  no-op fix              2
  skip                   2
  softened assertion     1
  fixture fitting        1
```

| repo | language | commits | findings |
| --- | --- | ---: | ---: |
| requests | python | 37 | 1 |
| flask | python | 35 | 4 |
| got | typescript | 39 | 6 |
| express | javascript | 33 | 21 |
| gin | go | 27 | 3 |

## What changed, and why

**`suppression` left the default rule set.** It was 100 of 136 findings. It is a correct detector answering the wrong question on a pull request: standing debt is what `/witness-audit` is for. Still on in the agent hook, where an agent adding `# type: ignore` mid-fix is exactly the case this project exists to catch, and available anywhere via `--all`.

**`fixture fitting` now requires a real correspondence.** It used to fire on any new branch against a bare literal. It now requires the literal to be one the *test* supplies, ignores trivial literals like `0` and `1`, and stays quiet when several literal branches arrive together, because that is a dispatch table rather than a special case fitted to one fixture.

**`softened assertion` requires locality and a shared subject.** The removed strict form and the added loose form must sit within 8 lines of each other and mention at least one identifier in common. Without that it produced this, from flask, and called it a softening:

```diff
-   assert client.get("/get").data == b"42"
+   assert not request_ctx._session.accessed
```

**Findings group in the report.** One express commit changed `Content-Disposition` quoting and produced 18 individually correct `moved goalpost` findings across many test files. That is one decision to explain, not 18 problems. Text and Markdown collapse them; SARIF deliberately does not, because GitHub annotates lines.

## Honest reading

There is **no precision number here** and there cannot be: nobody has labeled these commits, and no ground truth exists for "was this change a cheat". A rate is not an accuracy.

What the rate does say is whether the tool is survivable. At 122 findings per 100 commits it was noise and would have been muted in week one. At 11.1 issues per 100 commits — roughly one per nine commits — it is something a reviewer can actually read.

`moved goalpost` is 22 of 35 findings, and by hand every one is a genuine change to what a check expects. That is the tell this project contributed, and it is behaving.

## Reproduce

```bash
node benchmarks/wild.js --clone
node benchmarks/wild.js --commits 40
node benchmarks/wild.js --commits 40 --sample 15   # findings to judge by hand
node benchmarks/wild.js --all                      # including suppression
```

The repositories are cloned, never vendored, so this measures whatever their history looks like when you run it. Expect the numbers to drift.
