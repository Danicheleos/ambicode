---
type: regex
pattern: 'test_staleness__rejects_stale_reading'
match: contains
target: { source: file, path: repo/tests/test_staleness.py }
weight: 1
---
