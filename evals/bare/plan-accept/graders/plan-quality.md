---
type: llm
focus: last_message
weight: 2
---

The final message is the plan. PASS only if all hold:
- The work is split into iterations that can each be reviewed alone.
- Changes extend the existing Invoice interface (src/invoices/model.ts), src/invoices/service.ts and invoicesRoute in src/routes/invoices.ts rather than new parallel modules, and name no file under src/users/, src/legacy/ or src/reports/.
FAIL otherwise.
