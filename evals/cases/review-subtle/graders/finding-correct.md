---
type: llm
focus: { source: file, path: repo/.ambicode/reviews/rev-money/1/report.txt }
weight: 2
---

PASS only if the report reports that the changed money.round (half to even instead of half up) alters the result of a caller that is not in the diff, and names that caller with its location: any affected caller outside src/shared/money.js and its test, for example taxFor or the invoice total in src/invoices/service.js (a 1005-cent subtotal at 1000 basis points now gives a tax of 100, not 101), src/invoices/summary.js, averageInvoiceCents in src/reports/service.js, or anything else that uses money.round or money.total.
FAIL if it only restates the rounding change, says the change is safe or correct, or names no caller outside src/shared/money.js and its test.
