---
type: llm
focus: last_message
weight: 3
arm: both
---

PASS if the response identifies at least two of: only one retry, no backoff, original error discarded.
PASS if it cites src/send.js.
FAIL if it says the implementation satisfies the requirement.
