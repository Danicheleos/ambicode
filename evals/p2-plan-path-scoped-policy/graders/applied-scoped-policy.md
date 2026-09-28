---
type: llm
focus: last_message
weight: 3
arm: both
---

PASS if the plan places `cancel` alongside the existing orders service
function rather than proposing a new parallel location, consistent with a
"keep orders logic in the service layer" rule.
FAIL if the plan puts `cancel` in a new file or module outside the existing
orders service without explaining why.
