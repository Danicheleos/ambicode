---
name: fix-bug-plain
description: "a bug fix with no ticket and no plan word"
tags: ["trigger", "test"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

In the repository at `repo/`, the pagination helper drops the last page when the total is an exact multiple of the page size. Fix it.
