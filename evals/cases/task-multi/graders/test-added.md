---
type: llm
focus: { source: file, path: repo/tests/payments/payments.test.js }
weight: 2
---

PASS if the file contains a test that would fail on the original defect: an invoice is paid in full, part of it is refunded, and the test asserts the invoice status is partially_paid (or that the paid amount is the net). The original tests are still present and unchanged in meaning.
FAIL if no such test exists or an existing assertion was weakened or removed.
