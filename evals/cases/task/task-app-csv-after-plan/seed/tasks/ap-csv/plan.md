---
status: accepted
---

# CSV download of the invoices

| requirement | section | code |
| --- | --- | --- |
| one line per invoice with id, customer id, status and total, and a grand total line | Iteration 1 | src/reports/csv.js:6-13 |
| the amounts match what the invoice page shows, a void invoice included | Iteration 1 | src/invoices/routes.js:16 |
| served live, not through the cached /reports path | Iteration 1 | docs/architecture.md:8 |

## Iteration 1: invoicesCsv and GET /invoices.csv

*Goal*: GET /invoices.csv downloads every invoice as CSV with the header `id,customer,status,total` and a final `total` line; each total is the number the invoice page prints, so a void invoice is 0.

*Changes*:
- src/reports/csv.js:6-13 add `invoicesToCsv(rows)` beside toCsv, writing amounts with money.toDecimal (src/shared/money.js:35), escaping with the file's own cell (src/reports/csv.js:3) and summing the grand total with money.sum (src/shared/money.js:18); integer cents only, no toFixed.
- src/reports/service.js:35-38 add `invoicesCsv()` next to revenueCsv: the rows come from invoices.list (src/invoices/service.js:51) and carry the page's total (src/invoices/routes.js:16); export it (src/reports/service.js:62).
- src/invoices/routes.js:19-22 and :29-34 add an invoicesCsv handler and the route `GET /invoices.csv`, served as a file with attachment (src/shared/http.js:8) like revenueCsv (src/reports/routes.js:5); the handler only calls the service. /reports is cached for an hour by the gateway (docs/architecture.md:8), so the route stays under /invoices.
- tests/reports/csv.test.js:1 and tests/reports/service.test.js:1 cover the header, an escaped customer id, a void invoice at 0 and the grand total; build invoices with makeInvoice (tests/factory.js:21).

*Accept*: the file has one line per invoice plus the `total` line; a void invoice prints 0.00; the amounts are those of GET /invoices/:id.

*Checks*: unit (tests/reports), lint.

*Leaves out*: src/legacy/invoice-export.js (frozen, floating-point totals).
