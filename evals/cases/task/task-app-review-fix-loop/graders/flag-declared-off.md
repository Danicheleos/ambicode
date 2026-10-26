---
type: regex
pattern: 'refundEmails: false'
match: contains
target: { source: file, path: src/flags.js }
weight: 1
---
