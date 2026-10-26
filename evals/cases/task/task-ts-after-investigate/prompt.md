---
name: task-ts-after-investigate
description: 'After an investigation: waive() in lending/domain/fees is never called; returnItem takes an optional waiver reason and applies it before publishing the fee.'
tags: ["task", "seeded", "ts"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task lb-waiver --headless iteration 1 Let returnItem take an optional waiver reason and waive the late fee when one is given, using the waiver rule the investigation found. Cover it in test/return.test.ts.
