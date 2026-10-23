---
type: regex
pattern: '(import|from|require)[^\n]*(lending|catalog|members|notifications|billing)/(domain|application|http|channels)/'
match: not_contains
target: last_message
weight: 1
---
