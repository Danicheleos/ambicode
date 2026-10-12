---
type: llm
focus: last_message
weight: 2
---

PASS only if all hold:
- The answer says the total is computed by `total` in src/invoices/service.ts, as amountCents plus taxCents, and that a negative amount throws.
- It says the total is exposed through `invoicesRoute` in src/routes/invoices.ts (path /invoices).
- It does not present src/legacy/invoice-export.ts, src/reports/monthly.ts or docs/glossary.md as part of how the total is computed.
FAIL otherwise, including when the answer invents an HTTP framework, a database or a controller that is not in the repository.
