---
type: regex
pattern: 'invoices/summary\.js|summarize|\bview\b|displayTotal|(service|invoices)\.total\b'
match: contains
target: last_message
weight: 1
---
