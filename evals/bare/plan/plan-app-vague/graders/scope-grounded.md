---
type: llm
focus: last_message
weight: 2
---

The request is vague: "Late payers are a mess for us. Make the billing service handle them better."
PASS only if all hold:
- The plan states at least one explicit assumption about what "handle late payers better" means (for example reminders, a due date, an overdue report, a late fee) and says what it left out or leaves as an open decision.
- Every iteration serves the reading it states; none adds an unrelated feature.
FAIL otherwise.
