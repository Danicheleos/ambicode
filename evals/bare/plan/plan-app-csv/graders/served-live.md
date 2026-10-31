---
type: regex
pattern: '(^|\W)/invoices(\.csv\b|/[\w.-]*(csv|export|download)|\?format=csv)'
match: contains
target: last_message
weight: 3
---
