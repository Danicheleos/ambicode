---
name: task-py-after-investigate
description: 'After an investigation: forecast_window takes start and drops it; build_window labels the window with the reading time.'
tags: ["task", "seeded", "py"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

Make forecast_window honour its start argument, as the investigation found it ignored. Add the test to tests/test_forecast.py, named like the file's other tests.

An earlier investigation of this code found the following; build on it.

forecast_window takes a start time and never uses it, so a window always starts at the newest reading.

- forecast_window accepts `start` at src/tidewatch/app/queries/forecast.py:9 and calls `build_window(latest_reading(...), hours=hours)` at src/tidewatch/app/queries/forecast.py:11 without it.
- build_window sets `start=base.taken_at` at src/tidewatch/domain/rules/window.py:16, so the Window.start (src/tidewatch/domain/models.py:13-16) is the reading's time whatever the caller asked for.
- The heights are indexed from the reading, `range(hours)` at src/tidewatch/domain/rules/window.py:15; only the `start` label is wrong, not the heights.
- The only caller is tide_window in src/tidewatch/api/handlers/window.py:9-13, which passes `start` through and returns only `hourly_mm`, so no reply shows the start today.
- Tests: tests/test_forecast.py:8-14 checks the number of heights and the 49-hour limit; nothing asserts the window's start.
