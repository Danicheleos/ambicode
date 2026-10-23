---
type: llm
focus: { source: file, path: repo/src/payments/service.js }
weight: 2
---

PASS if refund() in this service file brings the invoice up to date after it stores the refund: it calls invoices.syncStatus (or an equivalent update of the invoice) with the net paid amount from the repository.
FAIL if refund() still stores the refund and emits its event without updating the invoice.
