---
type: regex
pattern: '(aging|bucketFor)[^\n]{0,120}(issue|issuedAt)|(issue|issuedAt)[^\n]{0,120}(aging|bucketFor)'
match: contains
target: last_message
weight: 1
---
