---
type: regex
pattern: 'bootstrap/[\w/.-]*Wiring\.kt[\s\S]*bootstrap/[\w/.-]*Main\.kt|bootstrap/[\w/.-]*Main\.kt[\s\S]*bootstrap/[\w/.-]*Wiring\.kt'
match: contains
target: last_message
weight: 1
---
