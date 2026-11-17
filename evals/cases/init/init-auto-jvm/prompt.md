---
name: init-auto-jvm
description: '/ambicode:init --auto on an uninitialised repository: Kotlin on Gradle, hexagonal across seven subprojects (domain, application, four adapters, bootstrap), JUnit 5 and ktlint. Config, packs, context and draft rules for four planted conventions.'
tags: ["init"]
runs: 1
max_turns: 24
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill, Agent]
---

/ambicode:init --auto
