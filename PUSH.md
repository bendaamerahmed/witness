# Pushing this repo

Everything is prepared: history rewritten to `bendaamerahmed <ahmed.b.daamer@gmail.com>`, branch `main`, tag `v0.2.0`, remote already set to `https://github.com/bendaamerahmed/witness.git`.

No AI attribution appears in any commit message or trailer.

## 1. Create the repo on GitHub (if it does not exist yet)

`github.com/bendaamerahmed/witness` currently returns 404. Create it **empty** — no README, no .gitignore, no license — so the first push is clean:

<https://github.com/new>

## 2. Push

```bash
cd <this folder>
git push -u origin main
git push origin v0.2.0
```

If you are asked for a password, use a personal access token with `repo` scope, not your account password — GitHub stopped accepting passwords for git operations.

## 3. Verify the identity landed

```bash
git log --format="%an <%ae>" -3
```

Should print `bendaamerahmed <ahmed.b.daamer@gmail.com>` three times.

If GitHub shows the commits as unattributed, add `ahmed.b.daamer@gmail.com` to your account emails at <https://github.com/settings/emails>.

## 4. After the first push

- **Social preview** — Settings → General → Social preview → upload `assets/social-preview.png`
- **Code scanning** — Settings → Code security → enable, so the `dogfood` CI job's SARIF upload lands
- **Moving major tag** so `uses: bendaamerahmed/witness@v0` resolves:
  ```bash
  git tag -f v0 v0.2.0 && git push -f origin v0
  ```
- **npm** — add an `NPM_TOKEN` repository secret if you want the release workflow to publish. Without it the publish step is `continue-on-error` and simply skips.
- **Topics** — `claude-code-plugin`, `ai-agents`, `static-analysis`, `sarif`, `test-integrity`, `reward-hacking`

## What CI will do on the first push

| job | what it does |
| --- | --- |
| `verify` | 3 OSes × 3 Node versions: rule-copy drift, manifest versions, doc links, 67 tests, precision gate |
| `instrument` | proves the benchmark harness can still tell a real fix from a fixture-fitted one |
| `dogfood` | witness scans its own pull requests (PRs only) |
| `action-smoke` | runs the Action end to end on Linux and Windows |

Tagging `v0.3.0` later triggers the release workflow: verify → npm publish with provenance → GitHub release with generated notes. `check-versions.js` refuses to publish if the tag disagrees with any of the five manifests.
