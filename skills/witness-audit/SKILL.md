---
name: witness-audit
description: >
  Sweep an entire repository for standing check debt: every suppression comment,
  skip marker, swallowed error, and disabled CI gate that has accumulated over
  time, ranked by what it hides. Reports the silence budget, how much of this
  codebase's green is real. Use when inheriting a codebase, before a release, or
  when the user asks how much of the test suite actually runs. Trigger:
  /witness-audit, "witness audit", "audit the repo", "how many tests are skipped",
  "find all the ignores", "how much of our green is real", "check debt".
license: Apache-2.0
---

# witness-audit

Repo-wide. `/witness-scan` does the diff, this does the accumulated total.

## Procedure

1. Sweep the tracked files. Respect `.gitignore`, skip `node_modules`, `vendor`, `dist`, `build`, `.venv`, `__pycache__`, lockfiles, generated files, and anything binary.
2. Count each category. Report counts before listing anything, the number is the finding.
3. For each, record file, line, and whether it carries a `witness:` note.
4. Check the CI config separately. A `continue-on-error: true` on the test job outranks a hundred `# noqa` lines.

## Categories, in report order

1. **Disabled gates** — CI steps with `continue-on-error`, `|| true` on a test command, a required check made optional, a coverage threshold lowered, a linter removed from the pipeline.
2. **Skipped tests** — `.skip`, `xit`, `@pytest.mark.skip`, `@pytest.mark.xfail`, `#[ignore]`, `t.Skip()`. Also `.only`, which silently skips everything else.
3. **Swallowed errors** — empty catch and except blocks, `rescue nil`, discarded error returns.
4. **Type and lint suppressions** — `@ts-ignore`, `# type: ignore`, `# noqa`, `#[allow(...)]`, `//nolint`, `@SuppressWarnings`, and whole-file variants like `/* eslint-disable */` or `# mypy: ignore-errors`, which are worth ten of the line-level kind.
5. **Coverage exclusions** — `pragma: no cover`, `istanbul ignore`, coverage config `omit`/`exclude` entries.

## Output

Lead with the budget:

```
silence budget
  disabled gates      <n>
  skipped tests       <n>  (of <total> tests found)
  swallowed errors    <n>
  suppressions        <n>  (<n> whole-file)
  coverage exclusions <n>
  declared (witness:) <n>
```

Then the ranked list, worst first, capped at 25 with a count of the remainder. Group by file when a file has more than three.

Close with one paragraph: which of these most likely hides a live defect, and the single one to remove first. Pick one. A list of fifty is a list nobody acts on.

## Judgment

Age matters. `git log -S` on a suppression tells you whether it was added during a deadline or has been load-bearing for four years. A four-year-old `# noqa` on a vendored import is fine. A three-week-old `@ts-ignore` next to a bug report is not.

Density matters more than count. Twelve suppressions in one file is a file with a problem. Twelve across a thousand files is a healthy codebase.

## Honesty boundary

Every item on this list may be correct. Some suppressions are the right answer to a broken upstream type definition, some skips are for a test that needs a GPU. The audit reports what is silenced, it does not claim the silence is wrong. Do not produce a remediation plan for all of it, produce the number and the one to start with.

Never report an estimated count. If the sweep did not finish, say what it covered.
