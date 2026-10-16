---
type: regex
pattern: 'src/(invoices|reports)/[\w./-]+\.js:\d+'
match: contains
target: last_message
weight: 1
---
