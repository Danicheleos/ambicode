---
name: url-question
description: A how-does-it-work question plus a Jira URL should route to investigate, not its siblings.
tags: ["trigger"]
runs: 3
max_turns: 8
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

How does the staged edit in the repository at `repo/` change the module's behavior? Context: https://example.atlassian.net/browse/ORD-17
