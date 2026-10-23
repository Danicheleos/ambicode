---
name: plan-ts-grace
description: 'Small change in a bounded-context service: the fee rule and the return flow are in lending, the tier lives in members, and contexts reach each other only through index.ts and the composition root.'
tags: ["plan", "small"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

/ambicode:plan --task plan-ts-grace --headless --answer plan-accept=Accept Members on the plus tier should get two grace days before a late fee starts to accrue. Basic members keep today's rule. The repository is at `repo/`.
