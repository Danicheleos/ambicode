---
type: regex
pattern: '## Files[\s\S]*(src\/legacy\/payment-hooks\.js|src\/notifications\/queue\.js)'
match: not_contains
target: last_message
weight: 1
---
