---
name: task-jvm-after-investigate
description: 'After an investigation: viabilityBands repeats the literal 50 of VIABILITY_FLOOR_PERCENT and has no test.'
tags: ["task", "seeded", "jvm"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task sv-floor --headless iteration 1 Make viabilityBands use the domain constant the investigation found instead of its own literal, and add ViabilityBandsTest.kt for it in the report test folder, next to the germination one. The repository is at `repo/`.
