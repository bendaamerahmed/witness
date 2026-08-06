# Security

## Threat surface

Small on purpose:

- **No network access.** The detector, the CLI, and every hook are pure local computation. Nothing in this repository makes an outbound request.
- **No dependencies.** Zero runtime dependencies. The whole supply chain is Node's standard library.
- **No telemetry.** Nothing is collected, counted, or phoned home.
- **No credentials.** Witness never reads, needs, or handles a token or key.

What it does touch:

| path | why | contents |
| --- | --- | --- |
| `$CLAUDE_CONFIG_DIR/.witness-active` | current level | one word (`full`, `lite`, `ultra`) |
| `~/.config/witness/config.json` | persisted default | `{defaultMode, guard, hideStatus}` |
| `<state dir>/witness-sessions/<id>.json` | session ledger | file paths, tell names, command strings — bounded and swept after 7 days |

The session ledger records command strings from `Bash` tool calls in order to notice that no test was run. If your commands routinely carry secrets on the argument line, set `WITNESS_GUARD=0` — the ledger is then never written.

## Running in CI

The GitHub Action needs `contents: read`, and `security-events: write` only if you use `upload-sarif`. It does not need a token of any other kind. Nothing leaves the runner.

## Hooks cannot break your session

Every hook is advisory by construction and defensive by implementation: stdin parsing times out, malformed input is ignored, state writes are best-effort, and `EPIPE` is swallowed. `tests/hooks.test.js` asserts that every hook survives empty and malformed stdin without hanging or crashing.

If a hook ever does break a session, that is a bug and a high-priority one.

## Reporting a vulnerability

Open a [private security advisory](https://github.com/bendaamerahmed/witness/security/advisories/new). Please do not open a public issue for anything you believe is exploitable.

Expect an acknowledgement within 72 hours.

## Supported versions

The latest tagged release. This project is pre-1.0; fixes go to `main` and the next tag.
