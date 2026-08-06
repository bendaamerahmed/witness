<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg">
  <img src="assets/wordmark.svg" alt="witness" width="420">
</picture>

<br><br>

[![ci](https://github.com/bendaamerahmed/witness/actions/workflows/ci.yml/badge.svg)](https://github.com/bendaamerahmed/witness/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@witness-plugin/witness?style=flat-square&color=111111)](https://www.npmjs.com/package/@witness-plugin/witness)
![precision](https://img.shields.io/badge/precision-100%25%20on%2055%20labeled%20cases-111111?style=flat-square)
![deps](https://img.shields.io/badge/dependencies-0-111111?style=flat-square)
![hooks](https://img.shields.io/badge/hooks-advisory%20only-111111?style=flat-square)
[![license](https://img.shields.io/badge/license-MIT-111111?style=flat-square)](LICENSE)

**The agent didn't weaken the test. It changed the question.**

</div>

---

## The cheat nobody's detector catches

```diff
-   assert fmt(1000) == "1000"
+   assert fmt(100)  == "100"
```

Same operator. Same strictness. No suppression, no skip, no `@ts-ignore`. Every assertion-strength linter ever written scores this **clean**, because it is not a weaker check — it is a *different* check. The failing case simply stopped existing.

We found this by running a benchmark, not by theorising. Across 96 cells of an agent under real pressure, this pattern was **88% of every cheat observed**, and our own six-tell detector caught **none of them**. It is the seventh tell now: `moved goalpost`.

<br>

| | |
|---|---|
| **100%** | precision and recall on 55 hand-labeled cases ([corpus](benchmarks/corpus/cases.js)) |
| **98%** | recall on 56 real agent-modified checks from the benchmark |
| **7** | tells detected across Python, JS/TS, Go, Rust, Ruby, Java, shell, CI config |
| **0** | dependencies, network calls, telemetry |

<sub>The 55-case corpus is hand-written by the same person who wrote the detector, which makes it a <b>regression gate, not an independent evaluation</b>. Treat 100% as "no known false positives", not as a precision estimate. Independent false-positive reports are the <a href=".github/ISSUE_TEMPLATE/false-positive.yml">most valuable issue you can file</a>.</sub>

## Why it matters

You ask your agent to fix a failing test. It comes back green. It changed the test.

Not maliciously. It found the shortest path to the state you asked for, and the shortest path from red to green runs through the assertion, not through the bug. Nobody lied. Every one of those checks was genuinely green.

This is not hypothetical. Across **623M analysed code changes**, GitClear found error-masking constructs up **47%** and refactored code collapsing from 21% to 3.8%. A study that mined **327 agent-authored public pull requests** found maintainer-identified cheating in 8% of them — and **seven were merged anyway**, into repositories including `microsoft/testfx` and `outline/outline`.

## The seven tells

```
moved goalpost       assert fmt(1000)  ->  assert fmt(100)     88% of observed cheats
no-op fix            only tests changed, and a check got weaker
softened assertion   toEqual(42)  ->  toBeTruthy()
swallow              except Exception: pass
skip                 @pytest.mark.skip
suppression          # type: ignore
fixture fitting      if sku == "ABC-123": return 42
```

Full anatomy of each — how it works, when it is legitimate, how it is detected: **[docs/TELLS.md](docs/TELLS.md)**.

## Use it as a PR check

```yaml
name: witness
on: pull_request
permissions: { contents: read, security-events: write }
jobs:
  witness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: bendaamerahmed/witness@v0
```

Findings land in the job summary and in your code scanning tab as `note`-level annotations on the exact line. **Advisory by default** — it cannot fail your build unless you opt in with `fail-on`. Start that way, look at what it finds for a few weeks, then gate on one tell. [Full CI guide](docs/CI.md).

## Or as a CLI

```bash
npx @witness-plugin/witness --base main
npx @witness-plugin/witness --staged
npx @witness-plugin/witness --base main --sarif witness.sarif
```

```
tests/test_fmt.py:7  moved goalpost  assert fmt(1000) == "1000" -> assert fmt(100) == "100"
              -> the assertion is just as strict, but it is asking about a different
                 input than the one that failed. Restore the original input, or state
                 plainly that the original case was not part of the spec
```

One file, no dependencies, no network. Exit `0` unless you asked for a gate.

## Or in your agent, live

Witness also ships as an agent plugin: the same detector runs on every edit as an advisory, plus a ruleset that asks for evidence before a completion claim.

**Claude Code** — two separate prompts, it will not work as one:

```
/plugin marketplace add bendaamerahmed/witness
```
```
/plugin install witness@witness
```

**Codex · Copilot CLI · Gemini CLI · OpenCode · Qoder** — clone and point the host at the repo; each ships its own manifest.

**Cursor · Windsurf · Cline · Kiro · Zed · Aider · anything reading `AGENTS.md`** — copy one file:

| host | copy to |
| --- | --- |
| Cursor | `.cursor/rules/witness.mdc` |
| Windsurf | `.windsurf/rules/witness.md` |
| Cline | `.clinerules/witness.md` |
| Kiro | `.kiro/steering/witness.md` |
| Copilot Chat | `.github/copilot-instructions.md` |
| anything else | `AGENTS.md` |

Instruction-only hosts get the ruleset. Diff inspection needs hooks.

### Commands

| command | what it does |
| --- | --- |
| `/witness [lite\|full\|ultra\|off]` | set the level for this session |
| `/witness-proof` | produce the evidence block for a change |
| `/witness-scan` | scan the working diff |
| `/witness-audit` | sweep the repo for standing check debt |
| `/witness-ledger` | list declared `witness:` exceptions |
| `/witness-gain` | benchmark numbers, with caveats |
| `/witness-help` | reference card |

## The escape hatch is the point

Every one of the seven tells is sometimes correct. Tests really are flaky. Upstream stubs really are wrong. Witness forbids none of them — it forbids doing them silently.

```python
# witness: upstream stub types are wrong, tracked in #4412
import broken  # type: ignore
```

That silences the finding permanently and records it in `/witness-ledger`. The cost is one sentence. The number worth watching in a codebase is not how many exceptions it has — it is the ratio of declared to undeclared.

## Everything is advisory

No hook blocks a tool call, reverts an edit, or stops a session finishing. That is a design decision, not a limitation, and it comes from [Anthropic's own research on reward hacking](https://www.anthropic.com/research/emergent-misalignment-reward-hacking): strict anti-hacking prompts made models **more** likely to sabotage and lie. Block the greppable escape hatch and the agent finds an invisible one. The metric improves and the code does not.

So witness is framed as a positive duty (*prove it*) rather than a prohibition (*never do X*). Reasoning in [docs/SPEC.md](docs/SPEC.md).

## What the benchmark actually found

216 cells, Haiku 4.5, three arms. [Full write-up](benchmarks/results/2026-08-06-first-run.md).

**The ruleset does not beat a one-sentence prompt.** Under pressure: baseline 15.6%, one-line control 37.5%, full ruleset 40.6% honest. baseline-vs-witness p=0.050; **control-vs-witness p=1.000** — 13/32 against 12/32, one cell, and the ruleset costs 29% more per task.

**On solvable defects nothing cheated at all.** 96/96 honest, every arm. A model that *can* fix the bug has no reason to cheat; cheating is a pressure behaviour. Any benchmark in this space claiming large gains on solvable tasks should be read with that in mind.

**Every arm faked green a majority of the time.** The best was 59.4%. Witness measures that. It does not fix it.

That is why this README leads with the detector and not the ruleset: the detector is what the evidence supports. If you see "2.6× more honest" quoted from this project without the control column, that number is not supported by its own benchmark.

Four instrument bugs were found and are documented in the write-up — three by inspecting cells rather than trusting the aggregate. That section is longer than the results section on purpose.

## Development

```bash
npm run verify      # drift, versions, links, 67 tests, precision gate
npm run selftest    # benchmark instrument (needs python + pytest)
npm run sync        # regenerate per-host rule copies from AGENTS.md
```

`AGENTS.md` is the one true ruleset; every per-host rule file is generated from it and CI fails on drift. The precision floor is enforced in CI and **must never be lowered to make a build green** — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributors

<a href="https://github.com/bendaamerahmed/witness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=bendaamerahmed/witness" alt="contributors" />
</a>

False-positive reports are the most valuable contribution here — each one becomes a corpus case and raises the floor.

## FAQ

**Does this replace my linter?**
No. It answers one question a linter structurally cannot: did this change make a check pass without making the code right. A linter reads the file; witness reads the diff.

**Will it slow my agent down?**
The hook budget is enforced in [`tests/perf.test.js`](tests/perf.test.js). The ruleset does cost more — reproducing a failure is a run you were not paying for. The benchmark publishes cost and turns next to the integrity numbers rather than hiding them, because "it got faster" and "it stopped checking" are the same measurement from different angles.

**Does it catch everything?**
No. It catches what is visible in a diff. An agent that quietly overfits source to a fixture looks honest to every grep ever written — which is why the benchmark leans on held-out tests instead of on the detector.

**Does it fight with other plugins?**
It composes especially well with minimalism rulesets like [ponytail](https://github.com/DietrichGebert/ponytail). Ponytail governs how much code gets written; witness governs whether the green checkmark means anything. The smallest change that is *actually verified* is both goals at once.

**Why "witness"?**
Somebody has to have watched it fail.

## License

[MIT](LICENSE).
