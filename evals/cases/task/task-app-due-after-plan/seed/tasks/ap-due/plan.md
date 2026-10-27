---
status: accepted
---

# Add a due date to invoices

| requirement | section | code |
| --- | --- | --- |
| an invoice carries a dueDate | Iteration 1 | src/invoices/model.js:3-5 |
| a dueDate before the issue date is rejected | Iteration 1 | src/shared/validation/range.js:4-8 |
| the invoice mail and the invoice page show the stored date | Iteration 1 | src/invoices/service.js:41 |

## Iteration 1: store the due date, validate it, show it

*Goal*: create() stores a dueDate on the invoice, rejects one before issuedAt with a ValidationError, defaults it to the day the mail already promises, and the mail and the invoice page print the stored date.

*Changes*:
- src/invoices/model.js:3-5 createInvoice takes dueDate and keeps it on the invoice.
- src/invoices/service.js:27-43 create() takes an optional input.dueDate, defaulting to dueDateFor(issuedAt, customer.paymentTermsDays) (src/invoices/terms.js:6); an explicit one is checked with validateRange(dueDate, { min: issuedAt }, 'dueDate') (src/shared/validation/range.js:4), which throws ValidationError. sendInvoiceCreated (src/invoices/service.js:41) gets the stored invoice.dueDate instead of recomputing it.
- src/invoices/routes.js:8-17 view lists dueDate so the invoice page shows it.
- tests/invoices/service.test.js:3 add cases for the default date (customer terms and the config default), an explicit date, and an earlier date rejected; build invoices with makeInvoice (tests/factory.js:21). tests/invoices/routes.test.js:6 checks the page shows dueDate.

*Accept*: an invoice created with a dueDate before its issuedAt throws ValidationError; without one the stored dueDate equals dueDateFor(issuedAt, terms); GET /invoices/:id returns it.

*Checks*: unit (tests/invoices), lint.

*Leaves out*: the overdue report; the dueDate of src/payments/installments.js:1 belongs to payment plans; src/legacy/ is frozen.
