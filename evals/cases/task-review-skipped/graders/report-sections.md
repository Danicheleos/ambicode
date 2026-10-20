---
type: regex
pattern: 'Task report[\s\S]*\*\*Done\*\*[\s\S]*Checks[\s\S]*Review[\s\S]*Not verified'
match: contains
target: last_message
weight: 1
---
