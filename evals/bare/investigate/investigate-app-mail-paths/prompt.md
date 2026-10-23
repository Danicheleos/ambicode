---
name: investigate-app-mail-paths
description: 'Compare how two mails of one service reach the customer.'
tags: ["investigate", "depth"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

A customer gets a mail when an invoice is created and another when a payment is received. For each of the two, which code path sends it, and does it go through the event bus? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer. The repository is at `repo/`.
