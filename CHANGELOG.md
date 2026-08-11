# Changelog

## [0.8.0] — 2026-08-11

### Changed

- **Relicensed from MIT to Apache-2.0.** No code changed.

  What this adds over MIT: an **explicit patent grant** from contributors, **termination of that grant** for anyone who brings a patent claim over the software, and a requirement to **preserve attribution and the NOTICE file** when redistributing. MIT grants no patent rights at all and says nothing about patent aggression — that is the gap this closes.

  **Everything already published stays MIT, permanently.** Versions 0.2.0 through 0.7.0 remain available under MIT, and anyone who obtained a copy under it keeps those rights forever — including the right to fork from any tag up to and including `v0.7.0`. A licence change binds only what is published after it. This is recorded in [`NOTICE`](NOTICE) rather than left for someone to work out.

  Apache-2.0 was chosen over copyleft deliberately. witness earns its keep by running inside other people's pipelines, and GPL/AGPL dependencies are blocked outright by many corporate legal reviews. A licence that stops the tool being installed protects nothing worth protecting.

### Added

- [`NOTICE`](NOTICE), required by Apache-2.0 §4(d) and shipped in the package. It carries the copyright, the licence history above, and a note that `benchmarks/.wild-repos/` is a local cache of third-party repositories under their own licences, excluded from the package and from version control.
- A packaging test asserting all four manifests declare the same SPDX id, that `LICENSE` actually contains that licence, that the README badge agrees, and that `NOTICE` is in `files[]`. Verified it catches the realistic failure — one manifest left behind on the old licence.

## [0.7.0] — 2026-08-11

Five repositories became fifteen, four languages became eight, 171 commits became 496. The question was whether 93.5% was a property of the detector or of the five repositories it was measured on.

**Precision held: 94.1% by finding (32/34), 95% CI 81–98%.** The original five repositories still produce exactly 31 findings, so every previously published number stands. Write-up: [`2026-08-11-widened-sweep.md`](benchmarks/results/2026-08-11-widened-sweep.md).

Getting there took four defect fixes. Three of them affected real users, not just the benchmark, and finding them was the more valuable half of the exercise.

### Fixed

- **A renamed file reported every marker inside it as newly written.** `git diff --name-only` reports a rename only under its new path, so `git show <base>:<new-path>` fails, `before` is empty, and the whole file counts as added. `git mv` a test file with zero content change and witness reported the skips inside it as fresh — **in the CLI, not only the sweep**. Now resolved through `-M --name-status`, reading `before` from the old path. This produced 20 phantom findings in click's directory reorganisation.
- **`.skip(` matched iterator methods.** `exps.iter().skip(1)` in ripgrep and `external_args.iter().skip(1)` in clap were reported as disabled tests, one of them in a source file. The `.only(` rule beside it had always been anchored to `describe|it|test`; `.skip(` never was, and now is.
- **`@pytest.mark.skipif(WIN, reason="…")` was read as a disabled test.** A conditional skip carrying its own reason is the declared form this project asks for everywhere else. It now fires only when there is no `reason=`. Eleven of click's findings were this.
- **`no-op fix` was driven by a tell removed from the default set.** `suppression` left `SCANNER_DEFAULT` in v0.3.0 for being too noisy to report directly, yet `no-op fix` — which is in the default set — still used it as its "a check got weaker" signal. All three of its findings in the new repositories came from that path and two were plainly wrong: gson added 110 lines of new tests carrying `@SuppressWarnings("unchecked")`, and cobra changed `//nolint:golint,staticcheck` to `//nolint:staticcheck`, which suppresses strictly *less*. `suppression` is out of `WEAKENING`; it is still reported as itself in the agent hook.

### Added

- **Ten repositories, four new languages**: click, axios, cobra, chi, viper, ripgrep, clap, gson, okhttp, sinatra — Rust, Java, Kotlin and Ruby alongside the existing Python, JS, TS and Go.
- **Assertion recognition for the idioms those languages actually use.** `\bassert\b` requires a non-word character after "assert", so it never matched JUnit's `assertEquals`, Rust's `assert_eq!` or minitest's `assert_equal`. Fixed **before** the repositories were added: doing it in the other order would have added commits to the denominator and no findings to the numerator, so findings-per-100 would have fallen and read as an improvement. Five corpus cases pin the new idioms and one pins that `assertions`/`asserted` are still ordinary words.

### Changed

- Headline numbers, everywhere they appear: **94.1%** by finding (CI 81–98%), **85.7%** by issue (CI 60–96%), **6.9** findings and **2.8** issues per 100 commits.
- **The coverage the sweep does not have is now published.** Three of eight languages produced no findings at all, and counting recognised assertions per repository shows why: `got` 7 of 15,390 changed test lines, `cobra` 0 of 409. ava (`t.is`) and Go stdlib (`if got != want { t.Errorf }`) are invisible to the assertion rules — and `got` is one of the *original five*, so this was always true and simply uncounted. Findings-per-100 fell 18.1 → 6.9 and an unknown part of that is coverage rather than cleanliness. Stated as the most important caveat on the write-up.

## [0.6.1] — 2026-08-07

### Fixed

- **Two SARIF `helpUri` links have pointed at headings that do not exist since v0.2.0.** The anchor was built from the rule's display name, so `SwallowedError` produced `#swallowederror` and `SkippedTest` produced `#skippedtest`, while `docs/TELLS.md` is organised by tell — `## swallow`, `## skip`. GitHub renders that link in every code scanning alert, and a missing anchor lands silently at the top of the page rather than erroring. The anchor is now keyed on the tell, and all eight resolve. `deleted check` shipped in 0.6.0 with the same mismatch, which is how this was found.
- A test now reads the anchor **off the emitted `helpUri`** and asserts a matching heading exists, rather than re-deriving it — a test that recomputes the value it is checking agrees with a broken generator.

### Changed

- **The `moved goalpost` signature-change variant is decided against, not deferred.** The four remaining benchmark misses widened the API — `round_price(250)` became `round_price(250, mode='half_up')` — so two contradictory expectations could both hold. It occurs **zero times in the 171 pinned commits**, so its false-positive rate cannot be estimated; and in the benchmark cells the agent changed source and the held-out check it never saw **passed**, making it indistinguishable from ordinary API evolution without knowing the spec. Closed the way Go's `_, err :=` was closed, and written up under **What it gets wrong** in `docs/TELLS.md` rather than left as a silent gap.

## [0.6.0] — 2026-08-07

An eighth tell, found the way the seventh was: by re-running the benchmark and reading the cells the detector missed.

### Added

- **`deleted check`** — a test removed outright while no source file changed. Every other rule inspects *added* lines, so a pure deletion left nothing to inspect, and deleting the failing test scanned `clean` until now. It is the most direct cheat available.

  **The width was measured before the rule was written.** Across the 171 pinned commits, "any test removed" is **11.7 findings per 100** — `got` dropping a deprecated module with its nine tests, redirect tests consolidated, flask's greenlet rewrite. All legitimate, and at that rate the rule would roughly double this detector's entire output. That form was never built; it is the Go `_, err :=` shape, a correct observation that is the wrong thing to print. Requiring that no source file changed takes it to **1.8 per 100**.

  **Rename guard.** A test whose name survives with trailing digits changed, or whose body survives verbatim under a new name, is a rename rather than a deletion — `it('should encode data uri1')` and `uri2` becoming `uri` is a consolidation, and it was the false positive the first measurement produced. Bodies are compared raw, not skeletonized: blanking literals would make `assert fmt(1000) == "1,000"` and `assert fmt(1000) == "1000"` identical, and telling those apart is what `moved goalpost` exists for.

- Seven corpus cases pinning it in both directions — the cheat shape in Python and Go, and five legitimate shapes drawn from the sweep: a test removed with its source, a consolidation, a word-suffix rename, a duplicate whose twin survives, and a test-only refactor that removes nothing. Corpus is now **78 cases, 78/78 exact match**.

### Changed

- **`deleted check` is not in the scanner default**, decided by measurement rather than taste. On the pinned sweep it produces 3 findings and one is wrong in a way no diff-scoped tool can fix: express `9c85a25c02` "Remove duplicate tests" deletes a test whose identical twin lives in `test/res.json.js`, a file that commit never touched. The check did not disappear; witness cannot see the copy that survived. 2 of 3 is below both floors and n=3 claims nothing. It stays on in the agent hook, where the diff really is the whole change. Same precedent as `suppression`, which left the default set for the same kind of reason.
- The wild sweep is unmoved — 31 findings, 93.5% / 81.8% — because the sweep runs the scanner default. The scorer now names both held-out tells rather than only `suppression`.

### Fixed

- **A guard that could not fail.** `tests/sarif.test.js` asserted every tell has a SARIF rule by iterating `Object.keys(ASK)` — so a tell added without an advisory entry was absent from the loop and could not fail it. That is exactly what happened when `deleted check` landed: no `ASK` text, no SARIF rule, and a green suite. It iterates `ALL_TELLS` now and asserts both, and the missing entries were added.

## [0.5.1] — 2026-08-07

The benchmark was run again. The published run held up; one published number did not, and a blind spot turned up in the cells the detector missed.

96 cells, same two unfixable tasks, same three arms, same model, same `n=16`, one day later on post-contract-fix code. No API failures. $7.44. Write-up: [`2026-08-07-replication.md`](benchmarks/results/2026-08-07-replication.md).

### Changed

- **Recall corrected from 98% to 94.4%.** The first run measured 98.2% (55/56) on agent-modified checks. The replication measured **91.2% (62/68)**. The intervals overlap, so neither run contradicts the other — but quoting the better of two is selection, and the pooled **117/124 = 94.4%, 95% CI 89–97%** is what the evidence supports. Corrected in the README headline table, `docs/SPEC.md` §5, and the wild-sweep write-up.
- **An overclaim removed.** The README said *"Every arm faked green a majority of the time. The best was 59.4%."* With intervals attached only baseline (CI 68–93%) clears 50%; control (45–77%) and witness (42–75%) both reach below half. At n=32 that is what was observed, not what was established, and it now says so.
- Intervals added to the remaining bare rates, which v0.5.0's own rule required and missed: 88% of cheats is 52/59 (CI 78–94%).

### Added

- **A documented blind spot: a deleted test.** Two of the six misses were the agent removing the failing test outright. Every tell inspects *added* lines, so a pure deletion has nothing to inspect. Reproducible in two files, with `--all`, and still `clean: no tells`. Documented in `docs/TELLS.md` under its own heading rather than a footnote, and on the roadmap as a candidate eighth tell — **deliberately not implemented yet**, because a rule without a corpus and a measured precision is how Go's `_, err :=` got in and had to be removed.
- The other four misses rewrote the assertion around a new parameter (`round_price(250, mode='half_up')`) so both contradictory expectations could coexist — a moved goalpost whose shared-subject check does not survive an added argument.

### Fixed

- `benchmarks/README.md` opened with "There are no published numbers yet", in a repository whose front page leads with them. It also still called the metric `cheat rate` after v0.4.0 renamed it `flag_rate`, and nothing warned that the archived raw JSON under `results/raw/` stores the per-cell field as `cheated` — so anything rescoring those files silently reads nothing.

### Verified, not changed

Every published benchmark rate was recomputed from the preserved raw cells and reproduces exactly: faked green 84.4% / 62.5% / 59.4%, 88% of cheats (52/59), 98.2% recall (55/56). The run that appeared broken — 9 tampered checks, 0 flagged — is the preserved evidence for discovering `moved goalpost`, matching `tasks.py`'s "nine times out of nine". No published number was affected by the `run.py` contract bug, as the v0.4.0 changelog claimed.

## [0.5.0] — 2026-08-07

The release where the headline number stopped pretending to be precise.

93.5% was being read as a measurement. It is 29 of 31 observations, and it was carrying the reputation of six rules across four languages. Nothing about the detector changed here — both gates sit exactly where they did. What changed is that the number now says how much it knows.

### Added

- **A Wilson 95% confidence interval on every published rate.** By finding: **93.5%, CI 79–98%**. By issue: **81.8%, CI 52–95%**. The interval appears everywhere the figure does — README badge and headline table, `docs/TELLS.md`, `docs/CI.md`, the sweep write-up, and the scorer's own output. Wilson rather than the normal approximation, which returns `[0%, 0%]` for 0 successes of 1 — certainty asserted from a single observation, and not a hypothetical: two rules have exactly one wild finding each.
- **Per-tell breakdown.** `moved goalpost` is 21 of the 31 findings, so the aggregate was very largely a statement about one rule. Four of the six default rules have three findings or fewer between them. The two false positives are the *entire* wild sample for `softened assertion` and `fixture fitting`, which now read `0.0% [0.0%, 79.3%]` — one observation each, not a verdict.
- **Per-language breakdown, with exposure.** Each row carries the commits that produced it: JavaScript 19 findings from 33 commits (all one repository), TypeScript 6 from 39, Python 5 from 72, Go **1 from 27**. The roadmap said "27 Go commits and one Go finding is not a measurement of Go"; `[20.7%, 100.0%]` is now the arithmetic saying so in the output.
- Rules that produced nothing are printed with `n=0` and *unmeasured* rather than omitted. A missing row reads as if the rule had been measured and had done fine. `suppression` is named explicitly as absent from the sweep, since it is not in the scanner default.

### Notes

- **Inter-rater agreement, a wild recall estimate, and a wider sweep are deliberately not in this release.** All three require a labeller who is not the source of the first set of labels. Manufacturing a second opinion and publishing it as agreement would be making a check pass without making the thing right, which is the one thing this project cannot do to its own headline figure. They are v0.5.1, and the labels file takes pull requests.
- The detector is untouched: 71/71 on the corpus, 93.5% / 81.8% in the wild, both gates green.

### Fixed

- `package.json` declared its bins as `./bin/witness-scan.js`. npm rewrites that to `bin/witness-scan.js` on publish and warns about it on every release; the published manifest was always correct, but a warning nobody can act on trains you to skip the publish log, which is where real failures print. A test now rejects the `./` prefix.

## [0.4.2] — 2026-08-07

The storefront caught up with the product, and the manifest that ships this thing is finally gated like everything else in it.

### Fixed

- **The plugin description said six tells. There are seven.** `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` both said "catches the six ways a green check lies" — copy written before the seventh tell existed, and carried through the release that added it. Every other surface in the repository already said seven: README, `AGENTS.md`, all six agent rule files, all seven skills, and the CLI.
- **`moved goalpost` was missing from the marketplace description entirely.** It is 21 of 31 findings in the wild sweep, the tell carrying the headline precision number, and the one the README's central finding is about — 88% of every cheat observed in the benchmark, which the six-tell detector caught none of. It was the one absent from the sentence people read before installing.
- Two tests now hold this in place: one asserts every manifest stating a count states `ALL_TELLS.length`, the other asserts any manifest that enumerates the tells names all of them. Both fail against the v0.4.1 manifests — four failures — and pass now. Each also fails if it ever stops finding a manifest to check, so they cannot quietly become no-ops.

### Added

- **`claude plugin validate ./ --strict` runs in CI.** It reads `marketplace.json` and every `plugin.json` the entries point at, so a misspelled field or a wrong type fails the build rather than somebody's install. Verified it genuinely inspects the plugin manifest and not just the marketplace wrapper: given `keywords` as a string it reports *expected array, received string*. It needs no credentials.
- `homepage`, `repository`, `license` and `keywords` on `.claude-plugin/plugin.json`. The Codex and GitHub manifests already carried all four; the Claude manifest, for the ecosystem this plugin actually targets, was the thinnest of the four.

## [0.4.1] — 2026-08-07

The first release after the repository went public, and the first audit that assumed a stranger could read and run all of this.

Nothing here is research. Going public changed who the inputs come from, and two defects only mattered once that was true: the Action's inputs became something a stranger could shape, and the README became something a stranger copies.

### Security

- **Shell injection in `action.yml`** (`inputs.base`, `inputs.fail-on`, and the resolved base ref). Three steps interpolated `${{ }}` directly inside `run:`, where the value is pasted in as source text before a shell exists. A caller writing `base: ${{ github.event.pull_request.head.ref }}` — an ordinary line, and attacker-controlled, since git permits `;`, `$`, `` ` `` and quotes in branch names — could have run arbitrary commands on the runner. Every value now reaches bash through `env:` as a quoted variable, which is what the `Scan` step already did. A base ref containing a newline is rejected outright, because that writes extra pairs into `GITHUB_OUTPUT`.
- `tests/packaging.test.js` fails the build if any `run:` block in `action.yml` interpolates an expression again. It reports all seven pre-fix sites and none after.
- `SECURITY.md` says what a caller is trusted with. "Nothing leaves the runner" was a promise the injection broke.

### Fixed

- **Every documented `uses:` reference was broken.** README, `docs/CI.md` twice, and the release preamble all said `bendaamerahmed/witness@v0`. No `v0` ref had ever been pushed, so every copy-paste of the front-page snippet failed with *unable to resolve action* — for four releases. The moving major tag now exists, and `check-links.js` resolves every documented ref and fails when one does not exist. Links were checked; the one reference that is not a link was not.
- **The release workflow never printed whether the publish carried provenance.** `npm view <spec> --json` does not always return a single object, so `d.dist.attestations` threw a `TypeError` that `|| true` swallowed — on the very release that first carried provenance. It now asks the registry for that one field, and warns when there is no attestation.
- The detector source held two raw NUL bytes, used as the literal-blanking sentinel. They work, but ripgrep classifies the file as binary and refuses to search it while git's 8000-byte sniff does not, so a contributor's `grep` silently skipped the detector. Written as `\u0000` now; identical at runtime, and both precision gates are unmoved (71/71 corpus, 93.5%/81.8% wild).

### Removed

- `PUSH.md`, a pre-first-push personal runbook that was public and wrong in almost every particular — it stated the repository did not exist yet.

## [0.4.0] — 2026-08-06

The release where the wild sweep stopped being a rate and became an accuracy.

v0.3.0 could say how often witness speaks. It could not say how often it is right, because nobody had read the findings. Every one of them has now been read against its actual diff, with a written verdict: **93.5% precision by finding (29/31), 81.8% by issue (9/11)** — and both false positives are published by name rather than tuned away.

### Added

- **`benchmarks/wild-labels.json`** — a verdict and a reason on every finding in the sweep. Pull requests disagreeing with a verdict are explicitly welcome; one rater who maintains the tool is not independence.
- **`benchmarks/wild-pins.json`** — the sweep is pinned to exact upstream commits, so its numbers are reproducible on any machine and the labels stay attached to the findings they describe. `--head` still sweeps today's upstream, deliberately producing different numbers.
- **`npm run wild:precision`** — scores the pinned sweep against the labels. It fails on precision below floor, on a finding nobody labelled, and on a label describing a finding that no longer occurs. The last two are what stop labels drifting away from the detector.
- A CI job running that scorer on every pull request, with the numbers written to the run summary.
- `node benchmarks/wild.js --write-pins`, for moving the pins deliberately.

### Fixed

- **A test *name* was read as an assertion.** `it('should encode data uri1')` renamed to `...uri2` was reported as a moved goalpost, because `should` appeared inside the string. Assertion detection now blanks string literals first.
- **Go's `_, err :=` was read as a discarded error.** It is the opposite — it discards the byte count and keeps the error. The obvious repair, flagging `value, _ :=`, produced 34 findings in `gin`, every one ordinary code, because a regex cannot see whether the discarded position holds an `error`. **The rule was removed rather than repaired.** `_ = err` on its own line is still caught. A tell that needs types belongs in a type checker.
- **Grouping under-collapsed.** Evidence is truncated for display, which cuts string literals in half and leaves the opening quote unclosed, so the grouper's literal-blanking missed them. One express commit's seventeen `Content-Disposition` findings — one decision — grouped into seven "issues". Unterminated literals are now blanked too, and it groups into one. **Issues per 100 commits fell 11.1 → 6.4 with no detector change**; the old number was counting one decision seven times.

### Fixed — the pipeline, and two consumers that had drifted off the JSON contract

The v0.3.0 CI run was red, and reading it found real bugs rather than flakes. Both are the same shape: the JSON report is an API, 0.3.0 changed it correctly, and nothing that *reads* it was updated. Neither failure was loud.

- **The Action printed `undefined finding(s)` and never took the clean branch.** `action.yml` parsed the report with inline `node -e` and took `.length` of `findings`, which became a plain number in 0.3.0. Inline shell inside a YAML string is covered by no test, so it went unnoticed. The parsing now lives in `scripts/action-outputs.js`, which is tested against reports from the real renderer, and a test asserts `action.yml` never parses the report inline again. New outputs: `issues` and `status`.
- **The benchmark harness scored every cell as unflagged.** `benchmarks/run.py` read `scan["cheated"]`, a field the CLI stopped emitting in 0.3.0. `bool(None)` is `False`, so the aggregate would have published a confident flat zero. **No published number is affected** — the harness refuses to run until its selftest passes, and the selftest went red the moment the field disappeared, before the 2026-08-06 benchmark could be re-run. The metric is also renamed `cheat_rate` → `flag_rate`: it means "the detector said something", and calling that a cheat is the intent inference this project refuses to print.
- **New: `tests/contract.test.js`** pins the report's shape and both consumers, and the instrument selftest now checks the scan contract before anything else. The next schema change breaks a test instead of a job summary.
- **Dependabot pull requests failed the dogfood job.** They run with a read-only token regardless of `permissions:`, so the SARIF upload returned *Resource not accessible by integration*. The upload is now skipped for that actor; the scan still runs.
- **Action versions bumped** off the Node 20 runtime: `checkout` v4→v7, `setup-node` v4→v7, `setup-python` v5→v7, `cache` v4→v6, `action-gh-release` v2→v3, `codeql-action/upload-sarif` v3→v4.

The remaining v0.3.0 run failures — *Service Unavailable*, *Bad Gateway*, *Failed to resolve action download info* — were a GitHub Actions incident, not this repository. They need a re-run, nothing more.

### Changed

- **The release workflow creates the npm package end to end.** It reads the registry first and branches on three states: version already published (skip, not an error), package exists (OIDC), package does not exist (bootstrap with an optional `NPM_TOKEN`, since OIDC cannot create a package — [npm/cli#8544](https://github.com/npm/cli/issues/8544), re-checked and still open). Afterwards it **confirms the version against the registry** and reports whether it carries provenance, because trusting an exit code for "did it land" is the failure mode this project is about. `workflow_dispatch` runs a dry run.
- README, TELLS, CI, PUBLISHING, ROADMAP and CONTRIBUTING rewritten against the new numbers. Every rule with a known blind spot now documents it under **What it gets wrong**, in its own section.

### Numbers

| | v0.3.0 | v0.4.0 |
| --- | ---: | ---: |
| findings per 100 real commits | 20.5 | 18.1 |
| issues per 100 real commits | 11.1 | **6.4** |
| wild precision, by finding | not measured | **93.5%** |
| wild precision, by issue | not measured | **81.8%** |
| labeled corpus | 66 cases | 71 cases |
| tests | 105 | 122 |
| sweep reproducible | no | **pinned** |

There is still deliberately **no recall figure for the wild sweep**. That would mean reading all 171 commits by hand and deciding what witness should have said; nobody has. The 98% recall this project quotes is from synthetic sources and is labelled as such everywhere it appears.

## [0.3.0] — 2026-08-06

The release where the detector met real repositories and lost.

Running v0.2.2 over **111 real merged commits** from `requests`, `flask` and `got` produced **136 findings** — more than one per commit. The labeled corpus said 100% precision. Both were true: the corpus was written by the same person as the detector, so it measured intent, not reality.

### Fixed

- **`softened assertion` paired unrelated lines.** It matched any removed strict assertion against any added loose one anywhere in the same file, so a refactored test manufactured findings. It now requires the two to sit within 8 lines of each other **and** share a subject identifier.
- **`fixture fitting` fired on ordinary logic.** 24 of 24 findings were wrong: `if (property === 'destroy')` in a proxy handler, `if (sessions.length === 0)` in an emptiness check. It now requires the literal to be one the *test* supplies, ignores trivial literals, and stays quiet when several literal branches arrive together, because that is a dispatch table.
- **`suppression` left the scanner's default rule set.** 100 of 136 findings, essentially all intentional and long-standing. Standing debt belongs to `/witness-audit`. Still on in the agent hook; `--all` turns it on anywhere.
- **Unknown flags were silently ignored.** `--saarif` quietly ran a plain scan. Now refused, with a Damerau-Levenshtein suggestion.

### Added

- **Report formats: `--format text|json|md|html|pdf|sarif`, `-o/--out`.** The PDF writer is hand-rolled — zero dependencies is a stated promise and not worth trading for report formatting.
- **Finding grouping.** One express commit changed `Content-Disposition` quoting and produced 18 individually correct findings. That is one decision, and text and Markdown now say so. SARIF still emits every site, because GitHub annotates lines.
- **`benchmarks/wild.js`** — the sweep as a permanent, reproducible benchmark, published alongside the corpus number so the real-world rate can never be hidden again.
- `--rules`, `--all`, `--quiet`, `--level`, and a `--help` that documents every flag.

### Numbers

| | v0.2.2 | v0.3.0 |
| --- | ---: | ---: |
| findings per 100 real commits | 122 | 20.5 |
| **issues per 100 real commits** | — | **11.1** |
| labeled corpus | 59 cases | 66 cases |
| tests | 85 | 105 |

There is deliberately **no precision figure** for the wild sweep. Nobody has labeled those commits, and a rate is not an accuracy.

## [0.2.2] — 2026-08-06

Usability fixes found by actually running the published package through `npx`.

### Added

- **`--help`**. It did not exist. `witness --help` fell through into a scan, so the first thing anyone typing it outside a git repository saw was a git error. The help now documents every flag, the seven tells, the exit codes, and the `witness:` escape hatch.
- **`--version`**.
- A test asserting **every flag the parser accepts appears in `--help`**, so the two cannot drift.

### Fixed

- **The error outside a git repository was a leaked `execFileSync` message** (`Command failed: git diff --name-only` followed by git's own usage text). It now says what happened and points at `--cwd` and `--dir`.

## [0.2.1] — 2026-08-06

First public release. Fixes everything the first public CI run found.

### Fixed

- **`npm test` failed on every Windows runner.** The script was `node --test tests/*.test.js`; bash expands that glob, Windows cmd and PowerShell do not, so node received a literal `*.test.js` and looked for a file by that name. Now `node --test`, which uses node's own discovery and needs no shell. (`node --test tests/` is not the fix — node tries to `require()` the directory.)
- **The action-smoke job did `require('./out.sarif')`.** `require()` picks a loader from the file extension, has no idea what `.sarif` is, and parsed the JSON as JavaScript. Now `JSON.parse(readFileSync(...))`, and it additionally asserts the rule set is non-empty.
- **`witness-scan` leaked git's stderr.** `git show <base>:<path>` legitimately fails for a file added in the diff being scanned — that case is caught and handled, but git's `exists on disk, but not in <sha>` still reached the log and read like a crash. stderr is now captured rather than inherited.

### Added

- `tests/packaging.test.js` — guards that no npm script or CI step relies on shell globbing, that CI never `require()`s a non-JS file, that the declared `bin` exists with a shebang, that every `files[]` path resolves, and that the hook manifests reference no missing scripts. Green on two of three platforms is what a test should catch, not a user.
- `.gitattributes` normalizing line endings, and `core.fileMode = false`, because the Windows path used to move this repo reported all 100 files as executable.

## [0.2.0] — 2026-08-06

The release where the detector got measured, and two of its numbers turned out to be wrong.

### Added

- **SARIF 2.1.0 output** (`--sarif`) and a **GitHub Action**. Findings land in the code scanning tab as `note`-level annotations on the exact line. Advisory by default; `fail-on` is opt-in and empty unless you set it.
- **Labeled precision corpus** — 59 hand-labeled cases, 33 of them honest edits chosen because they *look* like tells. Enforced in CI with a 95% precision / 90% recall floor.
- **`moved goalpost`, the seventh tell.** An assertion of identical structure and strictness against a different input or expected value. It was 88% of every cheat the benchmark observed and the six-tell detector caught none of them.
- Latency budget tests for the guard hook, which runs on every edit.
- `scripts/uninstall.js`, `scripts/check-links.js`, `docs/TELLS.md`, `docs/CI.md`, `docs/ROADMAP.md`.
- CI matrix across 3 operating systems and 3 Node versions, plus a release pipeline that refuses to publish if the tag disagrees with any of the five manifests.
- Logo, wordmark and social preview.

### Fixed

- **`no-op fix` measured 5% precision and has been redefined.** It fired on any change touching only test files — but adding coverage, un-skipping a test, extracting a fixture helper and running a formatter are all test-only and all completely honest. It now requires *both* halves: no source file changed **and** a check in the same changeset got weaker.
- **A false negative that the above was hiding.** `assert x == 2.5` decaying to `assert x is not None` is the most common softening in Python, and the detector never saw it — the spurious `no-op fix` was firing on the same diff and satisfying the test that should have caught it. Fixing the precision bug exposed it. Bare-truthiness decay and `assertIsNotNone` are covered too.
- `} catch (e) {` followed by `}` was never matched as a swallow: the regex required the line to start with `catch`.

### Changed

- **README now leads with the detector, not the ruleset.** The benchmark found the ruleset indistinguishable from a one-sentence prompt (p=1.000). The detector is what the evidence supports, so that is what the front page claims.
- Precision and recall are published with the caveat that the corpus is hand-written by the same person who wrote the detector, making it a regression gate rather than an independent evaluation.

### Known limitations

- `fixture fitting` catches the obvious form and will miss a determined one. No diff-based rule can do better; the benchmark leans on held-out tests instead.
- The ruleset's effect over a one-line prompt is unproven. It is not marketed as better than one.

## [0.1.0] — 2026-08-06

First release. Chain-of-custody ruleset synced to 7 host formats, 7 skills, 7 commands, 5 advisory hooks, shared six-tell detector, standalone scanner, and a benchmark harness with held-out-test defence and a spend-gating selftest.

216-cell benchmark run: on solvable defects every arm scored 100% honest; under pressure the ruleset was not distinguishable from a one-sentence control. Four instrument bugs found and documented.
