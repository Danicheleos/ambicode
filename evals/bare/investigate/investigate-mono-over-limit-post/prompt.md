---
name: investigate-mono-over-limit-post
description: 'Follow a rejected request through the validation, the route and the error handling of a web service that sits in front of another project.'
tags: ["investigate", "stack"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

A POST /firings reaches the dashboard with a segment whose targetDc is 13500. What response does the client get, which code produces it, and does the request ever reach the engine? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer. The repository is at `repo/`.
