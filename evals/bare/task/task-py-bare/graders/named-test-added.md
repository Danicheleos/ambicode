---
type: regex
pattern: 'def test_staleness__\w*(future|ahead|skew)'
match: contains
target: { source: file, path: repo/tests/test_staleness.py }
weight: 1
---
