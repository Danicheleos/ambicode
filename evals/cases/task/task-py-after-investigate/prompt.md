---
name: task-py-after-investigate
description: 'After an investigation: forecast_window takes start and drops it; build_window labels the window with the reading time.'
tags: ["task", "seeded", "py"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task tw-start --headless iteration 1 Make forecast_window honour its start argument, as the investigation found it ignored. Add the test to tests/test_forecast.py, named like the file's other tests.
