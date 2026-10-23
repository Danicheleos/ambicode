---
type: regex
pattern: 'contexts/(billing|notifications|catalog)/[\w/.-]+\.ts:\d'
match: not_contains
target: last_message
weight: 1
---
