---
name: requirement-py
description: Working-tree review of a Python fixture against a supplied requirement.
tags: ["requirement", "python"]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Review the uncommitted change in the repository at `repo/` against the
requirement at https://example.atlassian.net/browse/ORD-31.

`repo/` is the repository under review. Change into it with `cd repo` before
running anything, and run every command from there; a command run anywhere else
is not about this change.

The requirement was retrieved already. Its evidence sits beside `repo/`, so
from inside the repository it is `../requirement-evidence.json`. It is kept
outside the repository deliberately: it is not part of the change under review.
