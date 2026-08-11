# Widened sweep — 2026-08-11

Five repositories became fifteen, four languages became eight, 171 commits became 496. The point was to find out whether 93.5% was a property of the detector or a property of the five repositories it was measured on.

**It mostly held — but only after the widening exposed four defects, three of them user-facing.** Finding them was the more valuable half of the exercise.

| | before | after |
| --- | ---: | ---: |
| repositories | 5 | **15** |
| languages | 4 | **8** |
| commits scanned | 171 | **496** |
| findings | 31 | **34** |
| findings per 100 commits | 18.1 | **6.9** |
| issues per 100 commits | 6.4 | **2.8** |
| finding precision | 93.5% (29/31), CI 79–98% | **94.1% (32/34), CI 81–98%** |
| issue precision | 81.8% (9/11), CI 52–95% | **85.7% (12/14), CI 60–96%** |

The original five repositories still produce **exactly 31 findings**, unchanged. Every number published before this sweep stands.

## What the widening broke, before it measured anything

Adding repositories in new languages produced **59 findings**, of which 25 were wrong. Fixing them took the count to 34. Each defect is worth naming, because three of them affected real users and not just the benchmark.

### 1. A renamed file reported every marker inside it as newly written

`git diff --name-only` reports a renamed file only under its **new** path. `git show <base>:<new-path>` then fails, `before` comes back empty, and every line in the file counts as added.

click reorganised its test directories, and the sweep reported **20 findings** — every long-standing `@pytest.mark.skipif` inside the moved files, as if it had just been written. The same code path is in the CLI, so this reached users:

```
$ git mv tests/test_a.py tests/unit/test_a.py     # zero content change
$ witness --base HEAD~1
witness 0.6.1 — 2 finding(s) across 1 file(s)
  tests/unit/test_a.py:3  no-op fix
  tests/unit/test_a.py:3  skip  .skip(
```

Fixed by reading `-M --name-status` and resolving `before` from the old path. A pure rename is now clean, and a skip genuinely added after a move still fires.

### 2. `.skip(` matched iterator methods

```
{ re: /\.(?:skip|todo)\s*\(/, what: '.skip(' }
```

That matches `exps.iter().skip(1)` in ripgrep and `external_args.iter().skip(1)` in clap — one of them in a **source** file, neither anything to do with tests. The `.only(` rule directly beneath it had always been anchored to `describe|it|test`; `.skip(` simply never got the same treatment. Now it is.

### 3. `skipif` with a stated reason was read as a disabled test

```python
@pytest.mark.skipif(WIN, reason="os.chmod() is not fully supported on Windows.")
```

A conditional skip that carries its own reason is the declared form this project asks for everywhere else. Eleven of click's findings were this. `skipif` now only fires when it carries no `reason=`.

### 4. `no-op fix` was driven by a tell that was removed from the default set

`suppression` left `SCANNER_DEFAULT` in v0.3.0 because on 111 real commits it produced 100 of 136 findings, almost all intentional. But `no-op fix` — which *is* in the default set — kept using `suppression` as its "a check got weaker" signal. A tell judged too noisy to report directly was still generating reports indirectly.

All three of its findings in the new repositories came from that path, and two were plainly wrong:

- **gson** added 110 lines of new tests carrying `@SuppressWarnings("unchecked")` — Java boilerplate on new test code, and the opposite of claiming a fix.
- **cobra** changed `//nolint:golint,staticcheck` to `//nolint:staticcheck`, which suppresses strictly **less** than before, and was read as a new suppression.

`suppression` is out of the `WEAKENING` set. It is still reported as itself in the agent hook, where an agent adding `# type: ignore` mid-fix is exactly the case worth catching.

## The three new findings, and why each is a true positive

- **sinatra `0135c85402`** — "Update tests for Haml v7". `class='header'` became `class=#{quote_char}header#{quote_char}` because Haml v7 emits a different quote character. Only the Gemfile and tests moved; no library source. Reported as both a moved goalpost and a no-op fix, and both are true: an expectation changed with nothing in this repository to explain it.
- **sinatra `025e8c5ead`** — "Fix malformed Content-Type headers (#2081)". `'foo/bar;level=1, charset=utf-8'` became `';charset='`, comma to semicolon. `lib/sinatra/base.rb` was fixed in the same commit. A correct fix with its expectation updated to match, and still a real expectation change.

## What the sweep still cannot see

Three of the eight languages produced **no findings at all** across 128 commits, and the scorer prints them as `n=0 — unmeasured` rather than as perfect. That is honest but incomplete, and the reason is measurable. Counting how many *changed test lines* the detector recognises as assertions:

| repo | language | changed test lines | recognised as assertions |
| --- | --- | ---: | ---: |
| `got` | typescript | 15,390 | **7 — 0%** |
| `cobra` | go | 409 | **0 — 0%** |
| `chi` | go | 1,371 | 22 — 2% |
| `clap` | rust | 325 | 15 — 5% |
| `okhttp` | kotlin | 1,035 | 99 — 10% |
| `viper` | go | 41 | 18 — 44% |

`got` uses **ava** (`t.is(...)`, `t.deepEqual(...)`); `cobra` and `chi` use **Go stdlib** (`if got != want { t.Errorf(...) }`). Neither is an `assert`-shaped call, so the assertion rules are nearly blind to them — and `got` is one of the *original five*, which means this was always true and simply invisible until someone counted.

A zero-finding repository is only evidence of cleanliness if the detector could have seen something. For these, it largely could not. Findings-per-100 fell from 18.1 to 6.9 in this sweep, and an unknown part of that fall is coverage rather than cleanliness. **That is the most important caveat on this page.**

Before the sweep was widened, the assertion pattern was fixed to recognise JUnit's `assertEquals`, Rust's `assert_eq!` and minitest's `assert_equal`, none of which it had ever matched. Go stdlib and ava remain unhandled: the assertion there is an `if` statement or a bespoke test API, not a call with `assert` in the name, and detecting them is a feature rather than a pattern tweak.

## Still one rater

Every verdict in [`wild-labels.json`](../wild-labels.json) was written by the same person who maintains the detector. Three times the sample size makes the estimate sharper; it does not make it independent. Cohen's κ against a second labeller remains the open item, and the labels file takes pull requests for exactly that.
