# Witness in CI

Two ways to run it, and one strong recommendation about the order.

## The recommendation

**Start advisory. Do not gate on day one.**

Run it on your pull requests with `fail-on: ''` for a few weeks and read what it finds. Every one of the seven tells has a legitimate version, and the ratio in *your* codebase is something you learn by looking, not by guessing. Teams that gate immediately meet a false positive during a release week and uninstall.

When you do gate, gate on one tell first. `moved-goalpost` and `no-op-fix` are the two with the least legitimate variance.

## GitHub Action

```yaml
name: witness
on: pull_request

permissions:
  contents: read
  security-events: write   # only needed for upload-sarif

jobs:
  witness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }   # required: the scan needs the base commit
      - uses: bendaamerahmed/witness@v0
```

Findings land in the job summary and, with `security-events: write`, in the repository's code scanning tab as `note`-level annotations on the exact lines.

### Inputs

| input | default | what it does |
| --- | --- | --- |
| `base` | PR base, else `HEAD^` | ref to diff against |
| `fail-on` | `''` (advisory) | comma-separated tells that fail the job, or `any` |
| `level` | `note` | SARIF level: `note`, `warning`, `error` |
| `upload-sarif` | `true` | send results to code scanning |
| `sarif-file` | `witness.sarif` | where to write SARIF |
| `comment` | `true` | write a job summary |

### Outputs

| output | what |
| --- | --- |
| `findings` | number of findings |
| `tells` | comma-separated tells found |

### Gating on one tell

```yaml
      - uses: bendaamerahmed/witness@v0
        with:
          fail-on: 'moved-goalpost,no-op-fix'
          level: error
```

## Without the Action

The scanner is a single Node file with no dependencies and no network access.

```bash
npx @witness-plugin/witness --help          # every flag, with examples
npx @witness-plugin/witness --base main
npx @witness-plugin/witness --staged
npx @witness-plugin/witness --dir before/ --dir after/     # no git needed

# reports
npx @witness-plugin/witness --base main --format md   -o review.md
npx @witness-plugin/witness --base main --format html -o review.html
npx @witness-plugin/witness --base main --format pdf  -o review.pdf
npx @witness-plugin/witness --base main --sarif witness.sarif

# rule sets — suppression is off by default, see docs/TELLS.md
npx @witness-plugin/witness --all
npx @witness-plugin/witness --rules moved-goalpost,no-op-fix
```

`--dir` needs no git repository at all, which is useful for comparing two
extracted trees or a build output against its input.

Exit codes: `0` clean or advisory-only, `1` a `--fail-on` tell was found, `2` the scanner could not run. Without `--fail-on` it can never fail your build.

### Pre-commit

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: witness
        name: witness
        entry: node node_modules/@witness-plugin/witness/bin/witness-scan.js --staged
        language: system
        pass_filenames: false
```

### GitLab CI

```yaml
witness:
  image: node:20
  script:
    - node bin/witness-scan.js --base "$CI_MERGE_REQUEST_DIFF_BASE_SHA"
  allow_failure: true
```

## What it does not do

No network calls. No telemetry. No API keys. No data leaves the runner. The scanner reads a git diff and applies regular expressions; that is the entire threat surface.

It does not review style, architecture, performance, or whether the change is a good idea. It answers one question: did this change make a check pass without making the code right.

## Reading the results honestly

A finding is not an accusation. `witness-scan` reports what is visible in a diff and deliberately never infers intent. "assertEqual became assertTrue at line 40" is a fact; "the author was trying to cheat" is not, and the tool will not say it.

If a finding is correct behaviour for your situation, keep it and add a `witness: <why>` comment. That silences it permanently and records the decision where the next reader will find it.
