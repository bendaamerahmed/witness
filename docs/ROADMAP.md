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

- [x] **Hand-labelled the wild sweep.** A verdict and a written reason on every one of the 31 findings, in [`benchmarks/wild-labels.json`](../benchmarks/wild-labels.json). **93.5% precision by finding (29/31), 81.8% by issue (9/11)**, both false positives published by name.
- [x] **Pinned the sweep.** [`wild-pins.json`](../benchmarks/wild-pins.json) fixes the exact upstream commits, so the numbers are reproducible on any machine and the labels stay attached to the findings they describe. `--head` still sweeps today's upstream for finding new failure modes.
- [x] **Scored it in CI.** `npm run wild:precision` fails on precision below floor, on an unlabelled finding, and on a label describing a finding that no longer occurs — the last two being what stops labels drifting away from the detector.
- [x] Two more detector bugs found by reading findings by hand: a test *name* containing "should" counted as an assertion, and Go's `_, err :=` read as a discarded error. The second was **removed rather than repaired** — a regex cannot see whether the discarded return is an `error`, and the obvious replacement produced 34 false positives in `gin`.
- [x] Grouping fixed: truncated evidence was splitting one 17-site decision into seven "issues". Issues per 100 commits **11.1 → 6.4** with no detector change; the old number was counting the same decision seven times.
- [x] Reports in `pdf`, `json`, `md`, `html`, `text`, `sarif` from every entry point, with `--version` and did-you-mean hints on every command.
- [x] Release workflow creates the npm package end to end: detects registry state, bootstraps a brand-new package, and **confirms the publish against the registry** rather than trusting an exit code.

## Next — v0.5.0: make the precision figure stand up

93.5% is one rater's opinion, and the rater maintains the tool. That is the weakest load-bearing number in the project now.

- [ ] **Inter-rater agreement.** A second labeller on the same 31 findings, with Cohen's κ published even if it is bad. One labeller is one opinion; the labels file takes pull requests for exactly this.
- [ ] **Per-language precision.** Every rule is language-shaped, and the sweep is Python- and JS-heavy: 27 Go commits and one Go finding is not a measurement of Go.
- [ ] **A confusion matrix per tell**, not aggregates. `moved goalpost` is 21 of 31 findings and is carrying the headline number for all seven tells.
- [ ] **A wild recall estimate.** Precision is the cheap half. Recall means reading commits witness said nothing about — even a hand-labelled sample of 40 would replace a blank with a range.
- [ ] Widen the sweep past five repositories, and past the healthy-codebase bias: these were picked because anything witness says about them is probably witness's fault.

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
