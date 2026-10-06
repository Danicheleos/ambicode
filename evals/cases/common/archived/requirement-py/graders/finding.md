---
type: llm
focus: last_message
weight: 3
arm: both
---

PASS if the response identifies that clamping accepts input the requirement says to reject, citing src/orders.py.
FAIL if it says the change satisfies the requirement.
FAIL if it praises the clamp as defensive.
