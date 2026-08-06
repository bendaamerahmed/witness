# Changelog

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
