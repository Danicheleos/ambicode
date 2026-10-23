---
type: regex
pattern: 'adapters/rest[\s\S]*adapters/cli|adapters/cli[\s\S]*adapters/rest'
match: contains
target: last_message
weight: 1
---
