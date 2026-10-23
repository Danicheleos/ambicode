---
type: regex
pattern: 'rejects a refund above what was paid[\s\S]*a refund is stored beside the payment'
match: contains
target: { source: file, path: repo/tests/payments/payments.test.js }
weight: 1
---
