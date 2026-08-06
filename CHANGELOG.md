# Changelog

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
