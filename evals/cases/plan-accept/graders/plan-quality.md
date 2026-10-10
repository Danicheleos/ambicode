---
type: llm
focus: { source: file, path: repo/.ambicode/tasks/plan-due/steps/plan-body.md }
weight: 2
---

This is the plan body. PASS only if all hold:
- Every iteration has Goal, Changes, Tests, Accept, Checks and Leaves out.
- Changes extend the existing Invoice interface (src/invoices/model.ts), src/invoices/service.ts and invoicesRoute in src/routes/invoices.ts rather than new parallel modules, and name no file under src/users/, src/legacy/ or src/reports/.
- Tests say what fails first, before the change.
FAIL otherwise.
