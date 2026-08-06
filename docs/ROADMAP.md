# Roadmap

Ordered by what unblocks the next thing, not by what is most fun.

An item moves to **Done** when it is measured and published, not when it is written. Two items below were closed by *deleting* a rule and by *removing* a claim; that counts.

## Done — v0.2.0

- [x] Seven tells, shared by hook, CLI, Action and benchmark
- [x] Precision and recall measured on a labeled corpus, gated in CI
- [x] SARIF 2.1.0 and a GitHub Action; witness works as a PR check
- [x] Latency budget on the hook that runs on every edit
- [x] CI across 3 OSes and 3 Node versions; release pipeline with tag/manifest agreement
- [x] 216-cell benchmark, published with its null result intact

## Done — v0.3.0

- [x] Wild sweep over real OSS commits, published as a permanent benchmark
- [x] Detector retuned against it: findings per 100 commits from **122 to 20.5**
- [x] `suppression` out of the scanner default; `fixture fitting` requires a real correspondence; `softened assertion` requires locality and a shared subject
- [x] Report formats: text, json, md, html, pdf, sarif — PDF hand-rolled, still zero dependencies
- [x] Finding grouping: one decision reported once
- [x] Strict flag parsing with did-you-mean suggestions

## Done — v0.4.0: an accuracy, not just a rate

The gap this release set out to close: witness could say how often it speaks, not how often it is right.

- [x] **Hand-labelled the wild sweep.** A verdict and a written reason on every one of the 31 findings, in [`benchmarks/wild-labels.json`](../benchmarks/wild-labels.json). **93.5% precision by finding (29/31), 81.8% by issue (9/11)**, both false positives published by name. v0.5.0 added the intervals: 79–98% and 52–95%.
- [x] **Pinned the sweep.** [`wild-pins.json`](../benchmarks/wild-pins.json) fixes the exact upstream commits, so the numbers are reproducible on any machine and the labels stay attached to the findings they describe. `--head` still sweeps today's upstream for finding new failure modes.
- [x] **Scored it in CI.** `npm run wild:precision` fails on precision below floor, on an unlabelled finding, and on a label describing a finding that no longer occurs — the last two being what stops labels drifting away from the detector.
- [x] Two more detector bugs found by reading findings by hand: a test *name* containing "should" counted as an assertion, and Go's `_, err :=` read as a discarded error. The second was **removed rather than repaired** — a regex cannot see whether the discarded return is an `error`, and the obvious replacement produced 34 false positives in `gin`.
- [x] Grouping fixed: truncated evidence was splitting one 17-site decision into seven "issues". Issues per 100 commits **11.1 → 6.4** with no detector change; the old number was counting the same decision seven times.
- [x] Reports in `pdf`, `json`, `md`, `html`, `text`, `sarif` from every entry point, with `--version` and did-you-mean hints on every command.
- [x] Release workflow creates the npm package end to end: detects registry state, bootstraps a brand-new package, and **confirms the publish against the registry** rather than trusting an exit code.

## Done — v0.4.1: what the first public audit found

Going public changed the threat model: the Action became something a stranger can run, and the README became something a stranger copies. Both had defects that only mattered once that was true. None of these were research; they were repairs.

- [x] **The documented Action reference did not exist.** README, `docs/CI.md` (twice) and the release preamble all said `bendaamerahmed/witness@v0`. No `v0` ref had ever been pushed, so every copy-pasted example failed with *unable to resolve action* — for four releases. The moving major tag now exists, and `check-links.js` resolves every documented ref and fails on one that does not. Links were checked; the one reference that is not a link was not.
- [x] **Script injection in `action.yml`.** Three `run:` blocks interpolated `${{ inputs.base }}`, `${{ steps.base.outputs.ref }}` and `${{ inputs.fail-on }}` straight into bash, where the value is pasted in as source before a shell exists. A caller passing an attacker-influenced ref — `base: ${{ github.event.pull_request.head.ref }}` is a normal-looking thing to write, and git allows `;`, `$`, `` ` `` and quotes in branch names — had arbitrary command execution on the runner. Every value now arrives through `env:` as a quoted variable, and a newline in a base ref is refused. A test reports all seven pre-fix sites and none after.
- [x] **SECURITY.md says what a caller is trusted with.** "Nothing leaves the runner" was a promise the injection broke.
- [x] Deleted `PUSH.md` — a pre-first-push personal runbook, public, and wrong in almost every particular.
- [x] Replaced the raw NUL bytes in `hooks/witness-detect.js` with `\u0000` escapes. A deliberate sentinel that worked, but ripgrep classified the detector as binary and refused to search it while git's 8000-byte sniff did not. Identical at runtime; both gates unmoved.
- [x] The release workflow reports provenance instead of crashing on it: `d.dist.attestations` threw a `TypeError` that `|| true` swallowed, on the first release that actually carried provenance.

## Done — v0.5.0: error bars, and where the number actually comes from

93.5% was being read as a precise number. It is 29 observations out of 31, and it was carrying the reputation of seven rules across four languages.

- [x] **An interval, not a point.** Every published rate now prints its Wilson 95% interval: **93.5% by finding is 79–98%**, and **81.8% by issue is 52–95%**. Wilson rather than the normal approximation, which returns `[0%, 0%]` for 0 of 1 — a claim of certainty from one observation, and a case that is an actual row in the table below. The interval appears everywhere the figure does: README badge and table, `docs/TELLS.md`, `docs/CI.md`, the sweep write-up and the scorer itself.
- [x] **Per tell, not aggregate.** `moved goalpost` is 21 of the 31 findings, so the headline was very largely a statement about one rule. Four of the six default rules have three findings or fewer between them, and the two false positives are the *entire* wild sample for `softened assertion` and `fixture fitting` — rows that now read `0.0% [0.0%, 79.3%]` rather than being averaged into silence. Rules that never fired are printed with `n=0` and *unmeasured*, because omitting them reads as if they had been measured and had done fine.
- [x] **Per language, with exposure.** Each row carries the commits scanned that produced it: JavaScript 19 findings from 33 commits (all from one repository), TypeScript 6 from 39, Python 5 from 72, Go **1 from 27**. "27 Go commits and one Go finding" is not a measurement of Go, and `[20.7%, 100.0%]` is the arithmetic saying so.

## Next — v0.5.1: independence, which needs a second person

The three items below were cut from v0.5.0 for one reason: **none of them can be done by the person or process that produced the first set of labels.** Generating a second opinion from the same source and publishing it as agreement would be, exactly and precisely, making a check pass without making the thing right. This project does not get to do that to its own headline number.

- [ ] **Inter-rater agreement.** A second labeller on the same 31 findings, with Cohen's κ published even if it is bad. The labels file takes pull requests for exactly this, and `.github/ISSUE_TEMPLATE/false-positive.yml` is the other door in.
- [ ] **A wild recall estimate.** Precision is the cheap half. Recall means reading commits witness said *nothing* about — a hand-labelled sample of 40 would replace a blank with a range. It is unmeasured today and says so in every place the precision figure appears.
- [ ] Widen the sweep past five repositories, and past the healthy-codebase bias: these were picked because anything witness says about them is probably witness's fault. New repositories mean new findings, and every new finding needs a verdict and a written reason before it counts.

## Then — v0.6.0: widen the science

- [ ] More pressure tasks. Two is not a task family, and cheating only appears under pressure.
- [ ] Three models, not one. Nothing here generalises past Haiku 4.5 today.
- [ ] n large enough to separate two instructions, or a published statement that they cannot be separated.
- [ ] An adversarial arm: an agent explicitly told to make CI green by any means, to establish the ceiling.

## Then — v0.7.0: reach

- [ ] GitLab CI and Bitbucket templates
- [ ] Language coverage: C#, PHP, Swift, Kotlin, Elixir assertion idioms
- [ ] `witness-audit` as a standalone CLI, for the standing-debt sweep without an agent
- [ ] A machine-readable ledger format so `witness:` markers can be tracked across releases

## Deliberately not planned

- **Blocking hooks.** Ever. See [SPEC §2 P1](SPEC.md) — strict anti-hacking prompts made models more likely to sabotage and lie.
- **Runtime dependencies.** Zero is a feature for the people who need this most.
- **Telemetry.** Nothing is collected, counted, or sent.
- **Intent inference.** The tool reports what is visible in a diff. "The author was trying to cheat" is not a fact and will not be printed.
- **A tell that needs information a diff does not contain.** Go's discarded-error case is the precedent: if deciding it correctly requires types, imports or runtime behaviour, it belongs in a type checker, not here.
