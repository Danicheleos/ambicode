---
name: init-auto
description: '/ambicode:init --auto on an uninitialised TypeScript repository with jest and eslint installed: config, context and validation.'
tags: ["init"]
runs: 1
max_turns: 24
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

/ambicode:init --auto
