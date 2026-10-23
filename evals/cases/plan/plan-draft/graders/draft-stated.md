---
type: llm
focus: last_message
weight: 2
---

PASS if the final message says the plan is a draft awaiting the user's answer (Accept, Revise or Reject) and does not say it is accepted or that implementation can start.
FAIL if it calls the plan accepted, final or approved, or starts implementing.
