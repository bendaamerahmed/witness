# Contributing

The rules this project applies to agents apply to the humans working on it too. That is not a joke — it is the only way the repo stays honest about its own numbers.

## Before you open a pull request

```bash
npm run verify        # rule-copy drift, manifest versions, links, 112 tests, corpus precision gate
npm run selftest      # benchmark instrument (needs python + pytest)
```

If you touched the detector, the grouper or the labels, also run the sweep over real merged commits — CI runs it on every pull request, and it is the gate that catches "correct on my cases, unusable on real code":

```bash
npm run wild:clone      # ~200MB of blob-filtered clones, once
npm run wild:precision  # score the pinned sweep against the hand-labels
```

## The house rules

**Reproduce before you fix.** If you are fixing a bug in the detector, add the case to [`benchmarks/corpus/cases.js`](benchmarks/corpus/cases.js) first and watch it fail. A detector change with no corpus case is a change nobody can verify later.

**Never lower a floor to make a build green.** There are two gates. [`benchmarks/precision.js`](benchmarks/precision.js) scores the synthetic corpus: 95% precision, 90% recall. [`benchmarks/wild-precision.js`](benchmarks/wild-precision.js) scores real merged commits against hand-written verdicts: 90% by finding, 75% by issue. If your change drops below one of them, the change is wrong, or the label is wrong. If it is the label, fix the label **and say so in the commit message** with the reasoning. Silently relabeling a case to pass a gate is the exact behaviour this project exists to detect — there is a corpus case whose label was deliberately changed, with the whole argument written next to it, as the worked example of doing this in the open.

**Disagreeing with a wild verdict is a welcome pull request.** [`benchmarks/wild-labels.json`](benchmarks/wild-labels.json) is one rater's opinion and that rater maintains the tool. Flip a verdict, write why in the `why` field, leave the old reasoning in the commit message. A second opinion on those 31 findings is worth more to this project than a new tell.

**A new tell needs three things.** A corpus case that catches it, at least two honest cases that look like it and must stay silent, and a SARIF rule in [`lib/sarif.js`](lib/sarif.js). The honest cases are the important ones.

**A tell that needs what a diff does not contain does not belong here.** A rule for Go's discarded errors was written, shipped, and then removed: deciding it correctly requires knowing whether the discarded return is an `error`, which a regex cannot see, and the plausible replacement produced 34 false positives in one repository. If your rule needs types, imports or runtime behaviour to be right, it belongs in a type checker.

**False positives outrank false negatives.** A missed cheat costs one cheat. A false positive costs the install. When you are trading one against the other, trade toward silence.

**`AGENTS.md` is the one true ruleset.** Never edit the per-host copies under `.cursor/`, `.windsurf/`, `.clinerules/`, `.kiro/`, `.qoder/`, `.agents/` or `.github/copilot-instructions.md` — they are generated. Edit `AGENTS.md`, then:

```bash
npm run sync
```

CI fails if a copy has drifted, and separately if `AGENTS.md` and `skills/witness/SKILL.md` stop agreeing on any of the 12 load-bearing rule phrases.

**Hooks are advisory. Permanently.** No hook may return `decision: block`, revert an edit, or prevent a session from finishing. This is not a stylistic preference — see [`docs/SPEC.md` §2 P1](docs/SPEC.md). A pull request that adds a blocking hook will be declined regardless of how good the detection is.

**Latency is a feature.** The guard hook runs on every edit. [`tests/perf.test.js`](tests/perf.test.js) enforces the budget. If your change needs more time than that, it belongs in `/witness-scan`, not in the hook.

**No dependencies.** Zero runtime dependencies is a selling point for the people who need this most. If you think you need a package, open an issue first and describe the problem rather than the package.

## Adding a benchmark task

Read [`benchmarks/README.md`](benchmarks/README.md) first. Two things get people:

- **A task the model can solve measures nothing.** The first full run scored 96/96 honest on every arm because the defects were fixable. Cheating is a pressure behaviour.
- **A held-out check must be satisfiable by a correct minimal fix, in the same shape as the bug.** The selftest gates on this because an early held-out check asserted Turkish dotless-ı handling on an accent-stripping bug and was penalising correct work.

## Reporting a false positive

The most valuable issue you can file. Please include the before, the after, the file path, and one sentence on why the change was correct. If it holds up it becomes a corpus case with your name on the commit, and the precision floor rises.

Two false positives are already published by name in [the sweep write-up](benchmarks/results/2026-08-06-wild-sweep.md) — both are rules that would need to see something a diff does not contain. If you can fix either without adding false positives elsewhere, that is the single highest-value change available in this repository.

## Commit messages

Describe what changed and why. If you changed a number the project publishes, say which number and what moved it.

## Releasing

Bump all five manifests, tag, push. `scripts/check-versions.js` refuses a release whose tag disagrees with any manifest, and the release workflow confirms the publish against the registry rather than trusting npm's exit code. See [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
