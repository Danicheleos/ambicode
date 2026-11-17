---
name: init-auto-go
description: '/ambicode:init --auto on an uninitialised repository: Go module with cmd/ and many small internal/ packages (one nested five levels deep), go test, go vet and golangci-lint. Config, packs, context and draft rules for four planted conventions.'
tags: ["init"]
runs: 1
max_turns: 24
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill, Agent]
---

/ambicode:init --auto
