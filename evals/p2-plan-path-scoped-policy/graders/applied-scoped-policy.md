---
type: llm
focus: last_message
weight: 3
arm: with-only
---

PASS if the plan places `cancel` alongside the existing orders service
function rather than proposing a new parallel location, consistent with a
"keep orders logic in the service layer" rule.
FAIL if the plan ignores that guidance without explaining why.
