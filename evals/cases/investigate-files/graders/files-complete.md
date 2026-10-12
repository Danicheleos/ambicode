---
type: llm
focus: last_message
weight: 2
---

PASS only if the answer lists src/invoices/model.ts and src/routes/invoices.ts as files to edit (src/invoices/service.ts and tests/invoices.test.ts may be listed either way, with a reason), and lists no file under src/users/, src/legacy/, src/reports/ or docs/ as one to edit.
FAIL if either is missing or any decoy is listed as a file to change.
