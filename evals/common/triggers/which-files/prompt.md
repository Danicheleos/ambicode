---
name: which-files
description: "\"which files would I touch\", the localize phrasing"
tags: ["trigger", "test"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Which files would I have to touch to add a retry option to the module in the repository at `repo/`? Only tell me; change nothing.
