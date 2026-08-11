---
name: witness-help
description: >
  Quick reference for witness: commands, intensity levels, the chain of custody,
  the seven tells, the `witness:` marker, and configuration. Use when the user asks
  what witness does, how to use it, what the commands are, or how to configure it.
  Trigger: /witness-help, "witness help", "how do I use witness", "witness
  commands", "what does witness do".
license: Apache-2.0
---

# witness-help

**A green check is not evidence. It is a claim.**

## Commands

| command | what it does |
| --- | --- |
| `/witness [lite\|full\|ultra\|off]` | set the level for this session, no argument reports the current one |
| `/witness default <level>` | set the level new sessions start in |
| `/witness-proof` | produce the evidence block for a change |
| `/witness-scan` | scan the working diff for the seven tells |
| `/witness-audit` | sweep the repo for standing check debt |
| `/witness-ledger` | list the declared `witness:` exceptions |
| `/witness-gain` | the benchmark numbers, with caveats |
| `/witness-help` | this card |

## The chain of custody

```
reproduce  ->  see it fail, record the command and the real output
locate     ->  the line that causes it, not the line that reports it
repair     ->  change the code under test, leave the check alone
re-run     ->  same command, unmodified check, real output
widen      ->  one case the check did not cover
```

## The seven tells

```
softened assertion   strict comparison relaxed into a loose one
suppression          @ts-ignore, # noqa, eslint-disable, --no-verify
skip                 .skip, xit, @pytest.mark.skip, #[ignore]
swallow              catch {}, except: pass, rescue nil, _ = err
no-op fix            only tests and config changed, source untouched
fixture fitting      a branch that matches exactly the test input
moved goalpost       same assertion, different input or expected value
```

Any of them can be the right call. None of them can be the silent call.

## The marker

```
# witness: upstream types are wrong, tracked in #4412
```

Declares an exception on purpose. `/witness-ledger` collects them. A marker without a real reason counts as undeclared.

## Levels

- **lite** — chain of custody on bug fixes, one advisory per edit
- **full** — the default, chain of custody on anything that ends in a behavior claim
- **ultra** — nothing is reported as working without a pasted command and its real output
- **off** — disabled, the state file is removed

## Configuration

| setting | where |
| --- | --- |
| default level | `WITNESS_DEFAULT_MODE`, or `defaultMode` in `~/.config/witness/config.json` |
| diff inspection off | `WITNESS_GUARD=0`, or `"guard": false` in the config file |
| subagent scoping | `WITNESS_SUBAGENT_MATCHER`, a regex over agent type |
| hide the statusline | `WITNESS_HIDE_STATUS=1`, or `"hideStatus": true` |

On Windows the config lives at `%APPDATA%\witness\config.json`.

## What it never does

Never blocks a tool call. Never reverts an edit. Never refuses to finish. Every hook is advisory, the worst it can do is tell the agent what it just did.
