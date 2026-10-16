---
type: regex
pattern: 'throw new Error\('
match: not_contains
target: { source: file, path: repo/src/payments/service.js }
weight: 1
---
