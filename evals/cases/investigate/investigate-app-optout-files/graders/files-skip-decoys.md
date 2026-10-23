---
type: regex
pattern: '## Files[\s\S]*(src\/notifications\/handlers\.js|src\/customers\/model\.js|src\/customers\/repository\.js|src\/flags\.js|src\/notifications\/service\.js|src\/legacy\/payment-hooks\.js)'
match: not_contains
target: last_message
weight: 1
---
