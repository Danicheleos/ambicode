---
type: regex
pattern: 'refundEmails: false'
match: contains
target: { source: file, path: repo/src/flags.js }
weight: 1
---
