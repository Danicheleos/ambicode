---
type: regex
pattern: '## Files[\s\S]*(src\/legacy\/invoice-total\.js|src\/legacy\/invoice-export\.js|src\/reports\/service\.js|src\/reports\/csv\.js)'
match: not_contains
target: last_message
weight: 1
---
