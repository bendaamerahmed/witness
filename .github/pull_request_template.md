## What changed

<!-- One or two sentences. -->

## Evidence

<!-- The rules this project applies to agents apply here. If you cannot fill a
     line, write "I did not run this" — that is always allowed and always
     cheaper than the alternative. -->

```
repro:  <command>  ->  <what it said before>
proof:  <command>  ->  <what it says now>
```

## Checklist

- [ ] `npm run verify` passes
- [ ] If this touches the detector: a corpus case was added to `benchmarks/corpus/cases.js`
- [ ] If this adds a tell: at least two *honest* cases that look like it and must stay silent
- [ ] If this touches `AGENTS.md`: `npm run sync` was run
- [ ] No precision or recall floor was lowered
- [ ] No hook was made blocking

## Numbers

<!-- If this changed a number the project publishes, say which and what moved it.
     If a corpus label changed, say why — silently relabeling to pass a gate is
     the exact behaviour this project detects. -->
