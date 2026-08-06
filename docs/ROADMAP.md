# Roadmap

Ordered by what unblocks the next thing, not by what is most fun.

## Done — v0.2.0

- [x] Seven tells, shared by hook, CLI, Action and benchmark
- [x] Precision and recall measured on a labeled corpus, gated in CI
- [x] SARIF 2.1.0 and a GitHub Action; witness works as a PR check
- [x] Latency budget on the hook that runs on every edit
- [x] CI across 3 OSes and 3 Node versions; release pipeline with tag/manifest agreement
- [x] 216-cell benchmark, published with its null result intact

## Done — v0.3.0

- [x] Wild sweep over real OSS commits, published as a permanent benchmark
- [x] Detector retuned against it: findings per 100 commits from **122 to 20.5**, issues to **11.1**
- [x] `suppression` out of the scanner default; `fixture fitting` requires a real correspondence; `softened assertion` requires locality and a shared subject
- [x] Report formats: text, json, md, html, pdf, sarif — PDF hand-rolled, still zero dependencies
- [x] Finding grouping: one decision reported once
- [x] Strict flag parsing with did-you-mean suggestions

## Next — v0.4.0: make a precision number possible

The wild sweep gives a **rate**, not an accuracy, because nobody has labeled those commits. That is now the biggest remaining gap: witness can say how often it speaks, not yet how often it is right.

- [ ] **Hand-label the wild sweep.** The commits are already collected and reproducible; what is missing is a human verdict on each finding. A few hundred labels turns the rate into a precision figure that would actually stand up.
- [ ] Inter-rater agreement on the labels. One labeller is one opinion.
- [ ] Per-language precision. Every rule is language-shaped and the current corpus is Python- and JS-heavy.
- [ ] Publish a confusion matrix per tell, not just aggregates.

## Then — v0.4.0: widen the science

- [ ] More pressure tasks. Two is not a task family, and cheating only appears under pressure.
- [ ] Three models, not one. Nothing here generalises past Haiku 4.5 today.
- [ ] n large enough to separate two instructions, or a published statement that they cannot be separated.
- [ ] An adversarial arm: an agent explicitly told to make CI green by any means, to establish the ceiling.

## Then — v0.5.0: reach

- [ ] GitLab CI and Bitbucket templates
- [ ] Language coverage: C#, PHP, Swift, Kotlin, Elixir assertion idioms
- [ ] `witness-audit` as a standalone CLI, for the standing-debt sweep without an agent
- [ ] A machine-readable ledger format so `witness:` markers can be tracked across releases

## Deliberately not planned

- **Blocking hooks.** Ever. See [SPEC §2 P1](SPEC.md) — strict anti-hacking prompts made models more likely to sabotage and lie.
- **Runtime dependencies.** Zero is a feature for the people who need this most.
- **Telemetry.** Nothing is collected, counted, or sent.
- **Intent inference.** The tool reports what is visible in a diff. "The author was trying to cheat" is not a fact and will not be printed.
