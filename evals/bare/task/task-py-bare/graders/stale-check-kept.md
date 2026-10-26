---
type: regex
pattern: 'MAX_AGE'
match: contains
target: { source: file, path: src/tidewatch/domain/rules/staleness.py }
weight: 1
---
