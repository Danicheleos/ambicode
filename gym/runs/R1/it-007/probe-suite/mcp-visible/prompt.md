---
name: mcp-visible
description: Probe. Can the harness present an MCP server to the agent?
tags: ["probe"]
runs: 1
max_turns: 5
timeout_seconds: 180
allowed_tools: [Read, Bash, mcp__stub__getJiraIssue]
---

Use the `getJiraIssue` tool to fetch the issue `DEMO-1` and reply with its summary, word for word.
