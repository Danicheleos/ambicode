---
type: llm
focus: last_message
weight: 2
---

PASS only if the answer says the command prints a failure with the unknown-gauge code TW-101, because the store that infra/wiring.py builds starts empty and nothing on the command's path ever adds readings.
FAIL if it says the command prints hourly water heights, or that it fails for staleness or window length, or names another code as the fresh-start result.
