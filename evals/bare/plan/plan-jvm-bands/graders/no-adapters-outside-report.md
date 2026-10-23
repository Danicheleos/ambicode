---
type: regex
pattern: 'adapters/(persistence|messaging)/[\w/.-]+\.kt:\d'
match: not_contains
target: last_message
weight: 1
---
