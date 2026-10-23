---
type: llm
focus: last_message
weight: 2
---

PASS if the answer states, in any wording, all three:
- The engine enforces the setpoint limit of 13_000 tenths of a degree (safety limits, applied when a Schedule is built).
- The dashboard enforces it separately, with its own copy of the constant that it does not import from the engine, applied to the segments of a new firing.
- The Python tools enforce no setpoint limit (their only limit is a calibration offset).
Extra detail (alert rules, tests, paths it did not trace) is fine.
FAIL if it says the tools enforce the setpoint limit, that the dashboard takes the constant from the engine, or that the limit is enforced in only one project.
