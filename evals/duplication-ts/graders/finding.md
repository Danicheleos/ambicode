---
type: llm
focus: last_message
weight: 3
arm: both
---

PASS only if all of:
- it identifies that the new file duplicates existing currency formatting;
- it names src/format.js or its currency helper.
FAIL if it reports no reuse issue.
