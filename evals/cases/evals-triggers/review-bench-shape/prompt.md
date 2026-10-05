---
name: review-bench-shape
description: "the neutral benchmark review prompt that fired 0 of 24 runs on Sonnet"
tags: ["trigger", "dev"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

In the repository at `repo/`, there is an uncommitted change. It implements the ticket below.

<ticket>
ORD-17: Reject negative order amounts
</ticket>

Review the change before it merges: report the problems a reviewer should raise, each with its file and line.

`repo/` is the repository under review. Change into it with `cd repo` before running anything, and run every command from there.

Do not edit anything.
