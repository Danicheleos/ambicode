---
name: task-py-bare
description: 'require_fresh checks only age above MAX_AGE, so a future-stamped reading passes; the new error needs an unused TW code.'
tags: ["task", "bare-request", "py"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task tw-future --headless iteration 1 A reading stamped in the future (a gauge with a skewed clock) passes require_fresh in src/tidewatch/domain/rules/staleness.py, because only an age above MAX_AGE is checked. Reject a reading more than 5 minutes ahead of now with a new TidewatchError subclass and a new TW code (follow CONTRIBUTING.md), and add a test in tests/test_staleness.py.
