---
name: p2-task-finding-fix-rereview
description: A small task alongside a pre-existing uncommitted defect the independent reviewer should catch, requiring a fix and a re-review.
tags: ["p2", "task", "typescript", "review"]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

In the repository at `repo/`, add a `pageCount(items, size)` helper next to
`page` in `src/page.js`, that returns how many pages of the given size
`items` splits into.

`repo/` is the repository under review. Change into it with `cd repo` before
running anything, and run every command from there; a command run anywhere
else is not about this change.

There is already an uncommitted change to `src/page.js` from earlier work.
Do not discard it — build on the file as it currently stands, and address
anything the independent review raises about it before reporting.
