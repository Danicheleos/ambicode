---
type: regex
pattern: 'starts a loan due a week later'
match: contains
target: { source: file, path: test/borrow.test.ts }
weight: 1
---
