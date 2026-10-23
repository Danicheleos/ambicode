---
type: regex
pattern: 'function refund[\s\S]*syncStatus'
match: contains
target: { source: file, path: repo/src/payments/service.js }
weight: 1
---
