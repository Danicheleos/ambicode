---
type: regex
pattern: '(import|from|require)[^\n]*members/(domain|application|http)/'
match: not_contains
target: last_message
weight: 1
---
