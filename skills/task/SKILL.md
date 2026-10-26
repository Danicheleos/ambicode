---
name: task
description: "Make one bounded code change with the record to prove it — the smallest change with its tests, formatted and checked, an independent review offered, and a report built from the ledger; it never commits, pushes, or publishes. Use when the user asks to implement, add, fix, or build something, hands over a Jira/Confluence URL to implement, or says to go ahead with or resume a plan."
argument-hint: <request-or-jira/confluence-url> [--requirement <url>]... [--plan <file>]
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Agent, Edit(**), Write(**), Bash(node *ambicode.mjs*), Bash(git status*), Bash(git diff*)
---

# Implement a change

A route hands you one step at a time: the change with its tests, format, an independent review
offered, then the report. Name `iteration N` (or `ORD-17 2`; a lone number with `--task`) in the request to run only that iteration; without it every iteration runs from the first not done, each with its review. Do what each step says; the output of the command it ends with brings the next step.

## Your part

The implementer subagent writes the code and runs the checks; the route formats, reviews and builds the report. You launch, relay and report, so the quality of the result depends on what you pass on and what you leave out.

- Launch the implementer with the prompt the step prints; the work file carries the brief. Do not add requirements the user did not state.
- Do not read the code to second-guess the implementer, and do not run tests yourself: a result you ran is not in the record.
- When the implementer returns `Gaps:` or the review lists findings outside the brief, carry them to the report as written; they are the user's to decide.
- A request that is several unrelated changes, or that hinges on a choice only the user can make, is not one bounded change: say which part you would do first and ask, instead of guessing.
- Red checks, a refused check, or a skipped review make the report say so. Never present them as done.

## Git boundary

Edit files only. Never commit, push, create a merge request, publish a comment, merge, deploy, or
transition a ticket: those are the user's decisions, and the review and the report describe uncommitted work. Never stash,
reset, checkout or clean: files changed before the task belong to the user, and the route's baseline keeps them
out of this task's review.

If no step message appeared, start the route yourself with the arguments unchanged (they begin `$0`):

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start task "<request>" [--requirement <url>]... [--plan <file>]
```
