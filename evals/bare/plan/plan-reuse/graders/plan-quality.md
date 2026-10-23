---
type: llm
focus: last_message
weight: 2
---

The final message states the plan or summarises it; judge what it states, and treat a point it leaves out as unknown unless it contradicts that point. PASS only if all hold:
- The dueDate check reuses validateDate and validateRange from src/shared/validation (for example validateRange(dueDate, { min: issuedAt }, 'dueDate')) and ValidationError through them; it does not add a new date comparison, a new validator module or a bare Error.
- The report extends the existing src/reports/ module (service.js, routes.js, repository.js, aging.js) and reuses what it has: invoices.outstanding or the unpaidInvoices query, and, if the plan computes days overdue, daysBetween from src/reports/aging.js, and, if it computes a grand total, money.sum or reports.total; the overdue filter itself may compare dates (dueDate before the as-of date). It does not add a parallel reporting module or recompute totals by hand.
- Invoice changes stay within src/invoices/ (model.js, service.js, routes.js, as needed), and money stays integer cents through src/shared/money.
- It names no file under src/legacy/ as something to change or reuse (src/legacy/invoice-total.js is a frozen floating-point copy), and does not treat the dueDate of src/payments/installments.js, which belongs to a payment plan, as an existing invoice due date.
- The work is split into iterations that can each be reviewed alone; new files are allowed (for example new tests).
FAIL otherwise.
