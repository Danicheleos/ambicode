---
name: init-auto-ts
description: '/ambicode:init --auto on an uninitialised repository: TypeScript service by bounded context with a shared kernel, jest and eslint declared in package.json. Config, packs, context and draft rules for four planted conventions.'
tags: ["init"]
runs: 1
max_turns: 24
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill, Agent]
---

/ambicode:init --auto
