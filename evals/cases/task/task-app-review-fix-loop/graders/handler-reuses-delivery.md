---
type: regex
pattern: 'function onPaymentRefunded[\s\S]*service\.deliver\('
match: contains
target: { source: file, path: src/notifications/handlers.js }
weight: 1
---
