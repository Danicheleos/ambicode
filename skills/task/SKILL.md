---
name: task
description: "Make one bounded code change with the record to prove it — a test that fails first, the smallest fix, formatted and checked, an independent review offered, and a report built from the ledger; it never commits, pushes, or publishes. Use when the user asks to implement, add, fix, or build something, hands over a Jira/Confluence URL to implement, or says to go ahead with or resume a plan."
argument-hint: <request-or-jira/confluence-url> [--requirement <url>]... [--plan <file>] [--from-draft <file>]
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Edit(**), Write(**), Bash(node *ambicode.mjs*), Bash(git status*), Bash(git diff*)
---

# Implement a change

A route grounds the change in the code and hands you one step at a time: a test that fails first, the smallest
fix, format, an independent review offered, then the report. Do what each step says; the output of the command
it ends with brings the next step.

## Judgments the route leaves to you

- **Smallest coherent change** that satisfies the request, or the one plan iteration the route names — not a later one.
- **Reuse before adding:** look for the existing helper, adapter or dependency first, and say when you reused one.
- **Never weaken a test:** no loosened assertion, no test rewritten to keep the defect, no snapshot updated for a green run.
- **Ask when a finding expands scope:** a review finding outside the brief is the user's call, never implemented silently.

## Git boundary

Edit files only. Never commit, push, create a merge request, publish a comment, merge, deploy, or transition a
ticket: those are the user's decisions, and the review and the report describe uncommitted work. Never stash,
reset, checkout or clean: files changed before the task belong to the user, and the route's baseline keeps them
out of this task's review.

## Report

Your final message has two prose parts — **Done** (what changed and why, with `path:line`) and **Remaining**
(findings not fixed, gaps, decisions still needed) — then the generated Evidence and Not verified sections,
exactly as the report step prints them. Never say tests pass unless Evidence shows a green check with a test count.

If no step message appeared, start the route yourself:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start task "$ARGUMENTS"
```
