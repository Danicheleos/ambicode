---
name: task-fix
description: 'A one-line defect with a passing-but-incomplete test: fix, test, format, report; the review offer is left to its default.'
tags: ["task"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill]
---

Fix page() in src/page.js: the last item of every page is missing, so page([1, 2, 3], 0, 2) returns [1] instead of [1, 2]. The repository is at `repo/`.
