---
type: llm
focus: last_message
weight: 3
arm: both
---

PASS only if all of:
- it concludes that the current `send` does not match SEND-14;
- it says `send` retries exactly once (a single retry after the first failure);
- it names the missing parts: up to three retries, and exponential backoff.
FAIL if it says the current behavior matches the requirement.
FAIL if it states a retry count other than one, or claims any backoff exists.
