---
type: regex
pattern: '(plugins|api/handlers|cli)/[\w/.-]+\.py:\d'
match: not_contains
target: last_message
weight: 1
---
