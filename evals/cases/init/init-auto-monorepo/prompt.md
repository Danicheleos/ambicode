---
name: init-auto-monorepo
description: '/ambicode:init --auto on an uninitialised repository: monorepo: Rust workspace (engine/), TypeScript Express app (dashboard/) with a generated client, Python tooling (tools/), vendored code (vendor/). Config, packs, context and draft rules for four planted conventions.'
tags: ["init"]
runs: 1
max_turns: 24
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill, Agent]
---

/ambicode:init --auto
