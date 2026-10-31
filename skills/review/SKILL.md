---
name: review
description: "Run AMBICODE's pinned, checked, independent review of one change (uncommitted work, --branch, or a merge-request URL, with or without --mr), optionally against --requirement tickets. Only when AMBICODE's review is named (/ambicode:review typed, or \"run ambicode:review\" asked by the user, also for a subagent): a plain \"review my change\" goes to Claude Code's built-in review."
disable-model-invocation: false
allowed-tools: Read, Grep, Glob, Agent, Bash(node *ambicode.mjs*)
---

# Review one change

A route runs the pipeline and hands you one step at a time. Do what each step says. The user is asked only when
the estimate shows the review cannot run as it stands (narrow or skip). The route publishes nothing.

If no step message appeared, start the route yourself:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start review $ARGUMENTS
```
