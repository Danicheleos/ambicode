---
type: regex
pattern: 'payments\.refund\([\s\S]{0,300}partially_paid'
match: contains
target: { source: file, path: repo/tests/payments/payments.test.js }
weight: 1
---
