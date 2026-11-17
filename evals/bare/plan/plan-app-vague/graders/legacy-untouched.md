---
type: regex
pattern: 'src/legacy/[\w.-]+:\d|new:\s*src/legacy'
match: not_contains
target: last_message
weight: 1
---
