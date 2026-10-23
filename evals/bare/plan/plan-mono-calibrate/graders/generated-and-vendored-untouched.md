---
type: regex
pattern: '__generated__/[\w.-]+:\d|new:[^\n]*__generated__|vendor/[\w/.-]+:\d'
match: not_contains
target: last_message
weight: 1
---
