---
type: regex
pattern: '## Files[\s\S]*(internal\/routing\/zones\.go|internal\/routing\/table\.go|internal\/customs\/limits\.go)'
match: not_contains
target: last_message
weight: 1
---
