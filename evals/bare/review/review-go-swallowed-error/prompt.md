---
name: review-go-swallowed-error
description: 'Local review of an uncommitted change on go-module-parcelhub.'
tags: ["review"]
runs: 1
max_turns: 20
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Review the uncommitted change in this repository. Cite `path:line` for each claim.
