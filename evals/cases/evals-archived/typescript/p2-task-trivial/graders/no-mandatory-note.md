---
type: llm
focus: last_message
weight: 2
arm: both
---

PASS if the response reports Done/Evidence/Not verified/Remaining (or
equivalent plain prose covering the same four things) without implying that a
task file or task ID was required for this change.
FAIL if it claims a mandatory task record was needed, or invents a task ID.
