---
name: task
description: "Make one bounded code change with the record to prove it — the smallest change with its tests, formatted and checked, an independent review offered, and a report built from the ledger; it never commits, pushes, or publishes. Use when the user asks to implement, add, fix, or build something, hands over a Jira/Confluence URL to implement, or says to go ahead with or resume a plan."
argument-hint: <request-or-jira/confluence-url> [--requirement <url>]... [--plan <file>] [--from-draft <file>]
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Agent, Edit(**), Write(**), Bash(node *ambicode.mjs*), Bash(git status*), Bash(git diff*)
---

# Implement a change

A route hands you one step at a time: the change with its tests, format, an independent review
offered, then the report. Do what each step says; the output of the command it ends with brings the next step.

## Git boundary

Edit files only. Never commit, push, create a merge request, publish a comment, merge, deploy, or transition a
ticket: those are the user's decisions, and the review and the report describe uncommitted work. Never stash,
reset, checkout or clean: files changed before the task belong to the user, and the route's baseline keeps them
out of this task's review.

If no step message appeared, start the route yourself with the arguments unchanged (they begin `$0`):

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start task "<request>" [--requirement <url>]... [--plan <file>] [--from-draft <file>]
```
