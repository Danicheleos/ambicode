---
type: regex
pattern: 'cmd/parcelctl/[\w.]+\.go:\d'
match: not_contains
target: last_message
weight: 1
---
