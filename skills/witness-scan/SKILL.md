---
name: witness-scan
description: >
  Scan the working diff for the seven ways a green check lies: softened assertions,
  suppression comments, skip markers, swallowed errors, no-op fixes that touch only
  tests, branches fitted to the test fixture, and moved goalposts where the assertion
  is just as strict but asks about a different input. Reports each with the file, line,
  and what to do about it. Use before committing or opening a pull request, or when
  reviewing changes an agent just made. Trigger: /witness-scan, "witness scan",
  "scan this diff", "check this diff for cheating", "did the agent weaken anything",
  "is this fix real".
license: Apache-2.0
---

# witness-scan

Look at what changed, not at the whole repo. `/witness-audit` does the repo.

## Procedure

1. Get the diff. `git diff` for unstaged, `git diff --cached` for staged, `git diff <base>...HEAD` when reviewing a branch. If there is no git, diff what the session touched.
2. Split the changed files into source, test, and config.
3. Walk each **added** line for the seven tells. Removed lines and pre-existing code are not this diff's problem.
4. A line carrying `witness:` on it or adjacent to it is a declared exception. Report it in a separate section as declared, do not count it as a finding.

## The seven tells

| tell | what to look for |
| --- | --- |
| softened assertion | a strict comparison removed and a loose one added in the same place: `assertEqual`→`assertTrue`, `toEqual`→`toBeTruthy`, exact→contains, a widened tolerance, a removed field from an expected object |
| suppression | `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `# noqa`, `# type: ignore`, `#[allow(...)]`, `pragma: no cover`, `@SuppressWarnings`, `//nolint`, `--no-verify`, `continue-on-error: true`, `\|\| true`, `set +e` |
| skip | `.skip`, `.only`, `xit`, `xdescribe`, `@pytest.mark.skip`, `@pytest.mark.xfail`, `@unittest.skip`, `t.Skip()`, `#[ignore]`, a test deleted outright |
| swallow | `catch {}`, `except: pass`, `except Exception: return None`, `rescue nil`, `_ = err`, `.catch(() => {})`, a default value returned where an error was raised, an optional chain added to dodge a crash |
| no-op fix | the diff touches only test, config or CI files, no source file changed, and the change is described as a fix |
| fixture fitting | a new branch or constant that matches exactly the value the test uses, a hardcoded return for a specific input, a lookup table with one entry |
| moved goalpost | an assertion with identical structure and identical strictness, asking about a different input or expecting a different answer: `assert fmt(1000) == "1000"` becoming `assert fmt(100) == "100"`, or an expected value edited to match what the code currently returns |

## Output

One line per finding. Terse. No preamble.

```
<file>:<line>  <tell>  <what changed>
              -> <the ask>
```

Then one of:

```
clean: <n> files, <n> added lines, no tells.
```

```
declared: <file>:<line>  <tell>  witness: <the stated reason>
```

## Ranking

Order by how much the finding hides. `no-op fix` first, then `moved goalpost`, then `softened assertion`, then `swallow`, then `skip`, then `suppression`, then `fixture fitting`. `moved goalpost` ranks second because it is the most common in practice and the hardest to see: the assertion is just as strict, so nothing about it looks weakened. A suppression is visible in the file forever. A softened assertion looks like a passing test.

## Honesty boundary

Report what you can see in the diff. Do not infer intent, do not accuse. "assertEqual became assertTrue at line 40" is a fact. "the agent was trying to cheat" is not, and it is not yours to say. Every finding has a legitimate version, the output asks for a reason, it does not assign one.

If the diff is clean, say it is clean in one line and stop. A scan that manufactures findings to look useful is the same failure in a different coat.
