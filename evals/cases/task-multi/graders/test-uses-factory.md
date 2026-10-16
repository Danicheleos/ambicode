---
type: llm
focus: { source: file, path: repo/tests/payments/payments.test.js }
weight: 2
---

PASS if every test the change added seeds its customers and invoices with makeInvoice and makePayment from tests/factory.js (imported from '../factory'). Calling payments.refund (or the payments service) directly in the test is allowed; the factory is for seeding.
FAIL if an added test seeds them from inline object literals, calls the repository or the model directly to seed data, or imports nothing from the factory while existing tests do.
