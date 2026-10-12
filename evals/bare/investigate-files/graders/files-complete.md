---
type: llm
focus: last_message
weight: 2
---

PASS only if the answer lists src/invoices/model.ts, src/routes/invoices.ts and tests/invoices.test.ts as files to edit (src/invoices/service.ts may be listed either way, with a reason), and lists no file under src/users/, src/legacy/, src/reports/ or docs/ as one to edit.
FAIL if any of the three is missing or any decoy is listed as a file to change.
