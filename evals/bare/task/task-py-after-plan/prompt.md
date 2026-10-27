---
name: task-py-after-plan
description: 'After a plan: check_hours accepts 0 and negative hours; the plan adds WindowTooShortError with the free code TW-311.'
tags: ["task", "seeded", "py"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

Implement the accepted plan below in this repository: make the changes it lists and add the tests it asks for.

# Reject a forecast window of less than one hour

| requirement | section | code |
| --- | --- | --- |
| a window must ask for at least one hour | Iteration 1 | src/tidewatch/domain/rules/window.py:8-11 |
| a new error with its own TW code | Iteration 1 | new: src/tidewatch/domain/errors.py WindowTooShortError |

## Iteration 1: check_hours refuses 0 and negative hours

*Goal*: forecast_window (src/tidewatch/app/queries/forecast.py:9-11) raises instead of returning an empty window when hours is below 1.

*Changes*:
- src/tidewatch/domain/errors.py:17-18 add `WindowTooShortError(TidewatchError)` beside WindowTooLongError.
- src/tidewatch/domain/rules/window.py:8-11 raise WindowTooShortError("TW-311", ...) when hours < 1. TW-311 is free: src/tidewatch/domain/rules/window.py:10 holds TW-310 and no other file uses TW-311 (codes are never reused).
- tests/test_forecast.py:12-14 add `test_forecast__rejects_window_under_one_hour` for hours=0 and hours=-3, named by the file's test_<module>__<behaviour> pattern.

*Accept*: forecast_window(..., hours=0) raises WindowTooShortError with code TW-311; hours=1 still returns one height; the handler in src/tidewatch/api/handlers/window.py:9-13 turns it into {"ok": False, "code": "TW-311"} with no change.

*Checks*: unit (tests/test_forecast.py), lint.

*Leaves out*: the start parameter that forecast_window ignores.
