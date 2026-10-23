---
type: llm
focus: { source: file, path: repo/.ambicode/tasks/plan-app-overdue/plan.md }
weight: 2
---

The plan is for adding a due date to invoices (a new field) and an overdue report.
PASS only if all hold:
- It does not treat the dueDate of src/payments/installments.js, which belongs to a payment-plan installment, as an existing invoice due date, and does not plan to reuse addMonths or schedule for invoices.
- Overdue is computed from the invoice's new dueDate and the as-of day, not from issuedAt plus a hard-coded number of days.
FAIL otherwise.
