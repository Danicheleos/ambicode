---
type: regex
pattern: 'payload[^\n]*itemId|itemId[^\n]*payload'
match: contains
target: last_message
weight: 1
---
