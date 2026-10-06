---
type: llm
focus: last_message
weight: 3
arm: both
---

PASS only if all of:
- it identifies at least two of: only one retry, no backoff, original error discarded;
- it cites src/send.js.
FAIL if it says the implementation satisfies the requirement.
