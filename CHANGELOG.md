# Changelog

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
