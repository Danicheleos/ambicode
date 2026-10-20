---
type: llm
focus: { source: file, path: repo/.ambicode/tasks/plan-due/plan.md }
weight: 2
---

The file is the accepted plan; judge what it states, and treat a point it leaves out as unknown unless it contradicts that point. PASS only if all hold:
- The work is split into iterations that can each be reviewed alone.
- Changes extend the existing Invoice interface (src/invoices/model.ts), src/invoices/service.ts and invoicesRoute in src/routes/invoices.ts rather than new parallel modules, and name no file under src/users/, src/legacy/ or src/reports/ as something to change.
FAIL otherwise.
