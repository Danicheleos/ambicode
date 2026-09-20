---
type: llm
focus: last_message
weight: 3
arm: both
---

PASS if the response identifies that the new file duplicates existing currency formatting.
PASS if it names src/format.js or its currency helper.
FAIL if it reports no reuse issue.
