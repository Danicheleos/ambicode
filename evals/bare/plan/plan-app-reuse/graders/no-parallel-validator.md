---
type: regex
pattern: 'new:\s*src/shared/(validation|dates?)/'
match: not_contains
target: last_message
weight: 1
---
