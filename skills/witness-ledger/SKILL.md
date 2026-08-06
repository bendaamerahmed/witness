---
name: witness-ledger
description: >
  Collect every `witness:` marker in the codebase into one ledger. These are the
  declared exceptions, places where a suppression, skip or softened check was kept
  on purpose with a stated reason. Shows what the team has consciously agreed to
  live with, separate from what merely accumulated. Use to review declared
  exceptions, before a release, or when deciding what to pay down. Trigger:
  /witness-ledger, "witness ledger", "show the declared exceptions", "what did we
  agree to live with", "list witness markers".
license: MIT
---

# witness-ledger

The audit finds silence nobody chose. This finds silence somebody chose, and reads what they said about it.

## The marker

One line, in the language's comment syntax, on or immediately above the thing it explains:

```
# witness: upstream stub types are wrong, tracked in #4412
# type: ignore[arg-type]
```

```js
// witness: flaky under CI parallelism only, passes locally, owner @dana
it.skip('reconnects after a socket drop', ...)
```

The reason is not optional and not decorative. `witness: needed` is not a reason and should be reported as undeclared.

## Procedure

1. Grep the tracked files for `witness:` in any comment form.
2. For each: file, line, the tell it sits on, the stated reason, and the age from `git blame`.
3. Flag three problems:
   - **empty** — the marker has no substantive reason
   - **stale** — the reason references an issue, ticket or version that is closed, merged or long past
   - **orphaned** — the marker no longer sits next to anything it could be explaining

## Output

```
declared exceptions: <n>

<file>:<line>  <tell>
  reason: <the stated reason>
  age:    <n> months  (<commit>, <author>)

...

problems
  empty     <n>
  stale     <n>
  orphaned  <n>
```

Close with one line: the oldest declared exception and whether its reason still holds.

## Judgment

A growing ledger is not a failing codebase, it is a codebase that writes things down. The number to watch is not the total, it is the ratio of declared to undeclared from `/witness-audit`. A repo with 40 declared and 6 undeclared is in better shape than one with 2 declared and 200 undeclared.

Stale is the interesting category. A marker that says "until the 2.x upgrade lands" in a repo running 3.4 is a free deletion and a real bug hiding underneath it about half the time.

## Boundaries

Do not remove markers. Do not rewrite reasons. Report, rank, and name the one worth revisiting.
