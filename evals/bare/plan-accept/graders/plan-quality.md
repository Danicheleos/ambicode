---
type: llm
focus: last_message
weight: 2
---

The final message is the plan. PASS only if all hold:
- Every iteration has Goal, Changes, Tests, Accept, Checks and Leaves out (or plainly equivalent headings).
- Changes extend the existing Invoice interface (src/invoices/model.ts), src/invoices/service.ts and invoicesRoute in src/routes/invoices.ts rather than new parallel modules, and name no file under src/users/, src/legacy/ or src/reports/.
- Tests say what fails first, before the change.
FAIL otherwise.
