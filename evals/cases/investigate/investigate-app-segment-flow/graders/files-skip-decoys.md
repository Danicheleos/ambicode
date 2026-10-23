---
type: regex
pattern: '## Files[\s\S]*(src\/reports\/top-customers\.js|src\/legacy\/invoice-total\.js)'
match: not_contains
target: last_message
weight: 1
---
