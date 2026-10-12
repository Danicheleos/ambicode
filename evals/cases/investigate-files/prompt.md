---
name: investigate-files
description: 'A which-files-would-change question; the right answer is the invoice boundary, not the decoys.'
tags: ["investigate"]
runs: 1
max_turns: 12
timeout_seconds: 420
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:investigate --task inv-files Which files would change to add a required dueDate field to invoices and return it from the invoices route? End your answer with a `## Files` section: one path per line, only the files the change edits. The repository is at `repo/`.
