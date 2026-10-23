---
name: task-review-skipped
description: 'The same defect with iteration 1 named and no gate answer: the review offer defaults to skip and the report must say verification is incomplete.'
tags: ["task", "gate"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill]
---

/ambicode:task --task fix-page-noreview --headless Do iteration 1 of this task: fix page() in src/page.js: the last item of every page is missing, so page([1, 2, 3], 0, 2) returns [1] instead of [1, 2]. The repository is at `repo/`.
