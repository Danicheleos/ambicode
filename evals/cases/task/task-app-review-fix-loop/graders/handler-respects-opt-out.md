---
type: regex
pattern: 'function onPaymentRefunded[\s\S]*contact\.receipts'
match: contains
target: { source: file, path: repo/src/notifications/handlers.js }
weight: 1
---
