---
name: init-auto-python
description: '/ambicode:init --auto on an uninitialised repository: Python service in layers (domain, app, infra, api) with a plugin directory, pytest and ruff declared in pyproject.toml. Config, packs, context and draft rules for four planted conventions.'
tags: ["init"]
runs: 1
max_turns: 24
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill, Agent]
---

/ambicode:init --auto
