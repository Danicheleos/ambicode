---
name: p2-investigate-boundary-shortlist
description: A bounded navigation question in a repository where keyword matching alone points at the wrong file.
tags: ["p2", "investigate", "typescript", "navigation"]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

In the repository at `repo/`, an invoice total is about to start including a
discount. Which files would that change have to touch, and which of the files
mentioning invoices are *not* part of that work?

List the files by path and say, for each one, what it contributes.

`repo/` is the repository under investigation. Change into it with `cd repo`
before running anything, and run every command from there.

Answer the question; do not edit anything.
