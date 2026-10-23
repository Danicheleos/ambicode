---
type: regex
pattern: '''60\+'''
match: not_contains
target: { source: file, path: repo/tests/reports/service.test.js }
weight: 1
---
