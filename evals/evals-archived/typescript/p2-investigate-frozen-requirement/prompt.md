---
name: p2-investigate-frozen-requirement
description: A bounded investigation of whether current behavior matches a frozen requirement.
tags: ["p2", "investigate", "typescript"]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Investigate whether the current behavior of `send` in `repo/src/send.js`
matches the requirement at https://example.atlassian.net/browse/SEND-14.

The requirement was retrieved already. Its evidence sits beside `repo/`, so
from inside the repository it is `../requirement-evidence.json`. It is kept
outside the repository deliberately: it is not part of what you are
investigating.

`repo/` is the repository under investigation. Change into it with `cd repo`
before running anything.

Answer the question; do not edit anything.
