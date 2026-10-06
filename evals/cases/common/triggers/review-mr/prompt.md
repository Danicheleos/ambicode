---
name: review-mr
description: "a GitLab merge request URL"
tags: ["trigger", "dev"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Review this merge request: https://gitlab.example.com/acme/shop/-/merge_requests/42. The local checkout is the repository at `repo/`.
