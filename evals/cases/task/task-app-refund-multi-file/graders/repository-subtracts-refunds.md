---
type: regex
pattern: 'KIND\.REFUND|''refund'''
match: contains
target: { source: file, path: repo/src/payments/repository.js }
weight: 1
---
