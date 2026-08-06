Install into Claude Code:

```
/plugin marketplace add bendaamerahmed/witness
/plugin install witness@witness
```

Or run `/plugin` for the interactive menu.

Or add the PR check:

```yaml
- uses: bendaamerahmed/witness@v0
  with:
    fail-on: ''   # advisory first. Look at what it finds before you gate on it.
```

Every hook is advisory. Nothing in this plugin blocks a tool call, reverts an edit, or fails your build unless you explicitly opt in with `fail-on`.
