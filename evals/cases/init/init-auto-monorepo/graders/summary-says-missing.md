---
type: regex
pattern: '\b[Mm]issing\b|\b[Nn]o (end-to-end|e2e|[a-z]+ )?(check|command|test)|\b(not found|none found|not configured)\b'
match: contains
target: last_message
weight: 1
---
