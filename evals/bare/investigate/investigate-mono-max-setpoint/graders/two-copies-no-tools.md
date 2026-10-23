---
type: llm
focus: last_message
weight: 2
---

PASS only if the answer says the limit (13_000 tenths of a degree) is enforced in the engine (safety limits, applied when a Schedule is built) and separately in the dashboard (its own constant, applied to the segments of a new firing), and that the Python tools enforce no setpoint limit (their only limit is a calibration offset).
FAIL if it says the tools enforce the setpoint limit, or that the dashboard takes the constant from the engine.
