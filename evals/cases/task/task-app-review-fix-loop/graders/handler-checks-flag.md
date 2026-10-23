---
type: regex
pattern: 'function onPaymentRefunded[\s\S]*isEnabled\(''refundEmails''\)'
match: contains
target: { source: file, path: repo/src/notifications/handlers.js }
weight: 1
---
