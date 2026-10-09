---
name: review
description: "Run AMBICODE's pinned, checked, independent review of one change (uncommitted work, --branch, or --mr <url>), optionally against --requirement tickets. Typed only: a natural-language \"review my change\" goes to Claude Code's built-in review, and AMBICODE's review runs only when /ambicode:review is typed."
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Agent, Bash(node *ambicode.mjs*)
---

# Review one change

A route runs the pipeline and hands you one step at a time. Do what each step says. The pipeline
pins the target, mirrors it into a snapshot, runs the checks the change affects, and gives the
bundle to the `ambicode:reviewer` subagent, which can only read the snapshot. The user sees an
estimate first and decides whether the reviewer runs. The route publishes nothing.

Report rules, with why:

- **An empty finding list is not a clean change.** It means the reviewer found nothing material in
  what it was given; it says nothing about what it was not given.
- **A failed reviewer is not a clean review.** It produced no finding list at all; the failure is
  the result.
- **A skipped check is not a pass.** Its limitation says why it did not run, and that is the
  evidence.
- **One unverifiable location voids the reviewer's whole answer.** A shorter list would hide that
  the rest was never checked.

If no step message appeared, start the route yourself:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start review $ARGUMENTS
```
