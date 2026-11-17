---
name: task
description: "Makes one bounded code change with the record that proves it: smallest change, tested (run when a check can run the tests; with none, only the tests the request asks for, unrun), formatted and checked, independently reviewed, reported from the ledger; never commits, pushes or publishes. Use only when /ambicode:task is named, by the user or a subagent."
argument-hint: <request-or-jira/confluence-url> [--requirement <url>]... [--plan <file>] [--no-review]
disable-model-invocation: false
allowed-tools: Read, Grep, Glob, Agent, Edit(**), Write(**), Bash(node *ambicode.mjs*), Bash(git status*), Bash(git diff*)
---

# Implement a change

The implementer subagent writes the code, records the checks and writes the report; the route formats, reviews and keeps the record. Your part is to launch and relay — the output of each command brings the next step. At the closing step, reply with the one `Task report:` line the hook gives.

## Modes
| Request | What runs |
|---|---|
| no iteration named | one implementer does every iteration not yet done, in order; one review of the whole change; the checks once over everything the task changed |
| `iteration N` (or `ORD-17 2`; a lone number with `--task`) | only that iteration; its checks by file run unasked |
| `--no-review` | either mode, without the review |

Either mode: one review follows over the change unless `--no-review`; headless runs none. A check that runs the whole project, or one the policy marks `propose`, runs only on your answer; headless skips it and lists it under Not verified.

## Your part
- Relay, do not redo: reading the code to second-guess the implementer or running tests yourself adds results that are not in the record.
- Add no requirement the user did not state.
- A request that is several unrelated changes, or that hinges on a choice only the user can make, is not one bounded change: say which part you would do first and ask.
- Gaps, findings outside the brief, red or refused checks and a skipped review stay in the report as not verified; they are the user's to decide.

## Git boundary
Edit files only. Commits, pushes, merge requests, comments, merges, deploys and ticket transitions are the user's decisions. Stash, reset, checkout and clean would destroy changes that predate the task; the route's baseline already keeps those out of the review.

If no step message appeared, start the route yourself with the arguments unchanged (they begin `$0`):

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start task "<request>" [--requirement <url>]... [--plan <file>]
```
