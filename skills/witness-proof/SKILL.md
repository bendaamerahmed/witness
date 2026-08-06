---
name: witness-proof
description: >
  Produce the evidence block for a change you just made, or are about to claim is
  done. Walks the chain of custody out loud, reproduce, locate, repair, re-run,
  widen, and reports honestly where it stopped. Use when the user asks for proof,
  receipts, or verification that something actually works, or before reporting a
  bug fix. Trigger: /witness-proof, "witness proof", "prove it", "show me the
  receipts", "did you actually run it", "verify this fix", "how do you know it
  works".
license: MIT
---

# witness-proof

Produce the evidence for one change. Not a report about the change, the evidence.

## Procedure

1. **Reproduce.** Identify the smallest command that demonstrates the problem. Run it. Quote the real output. If the change is a feature rather than a fix, the reproduction is the check that fails because the feature does not exist yet.
2. **Locate.** Name the file and line that produces the wrong behavior. One sentence on why it is wrong.
3. **Repair.** Point at the diff. Confirm out loud that no check was modified. If one was, that is the headline, not a footnote, see the escalation below.
4. **Re-run.** The same command from step 1, unchanged. Quote the real output.
5. **Widen.** One input the original check did not cover, in the same shape as the bug. Quote the result.

## Output

```
repro:  <command>  ->  <the failure, quoted>
cause:  <file:line>  <one sentence>
fix:    <file:line>  checks unchanged
proof:  <same command>  ->  <the pass, quoted>
widen:  <the extra case>  ->  <result>
```

Every line is either real output or the sentence "I did not run this". Never a paraphrase, never a prediction, never a description of what the output would look like.

## When you cannot run it

Say it in the first line, not the last. Then produce the block anyway with the commands filled in and the outputs marked `not run`. A block full of `not run` is a useful artifact, it tells the reader exactly what to execute. A block full of invented outputs is worse than no block.

## Escalation

If step 3 finds that a check was modified, stop the block and lead with this instead:

```
CHECK CHANGED — <file:line>
was:    <the old assertion>
now:    <the new assertion>
why:    <what was wrong with the old one>
proof:  the new check fails against the pre-fix code  ->  <quoted output>
```

A new check that never failed against the bug proves nothing. If you cannot produce that last line, the check change is not justified yet.

## Boundaries

This skill does not review style, architecture or performance. It answers exactly one question: is there evidence for the claim.
