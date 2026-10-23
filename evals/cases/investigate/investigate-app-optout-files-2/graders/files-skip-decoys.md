---
type: regex
pattern: '## Files[\s\S]*(src\/flags\.js|src\/legacy\/payment-hooks\.js|src\/notifications\/service\.js|src\/customers\/repository\.js)'
match: not_contains
target: last_message
weight: 1
---
