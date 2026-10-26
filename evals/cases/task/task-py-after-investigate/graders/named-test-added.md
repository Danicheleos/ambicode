---
type: regex
pattern: 'def test_forecast__\w*start'
match: contains
target: { source: file, path: tests/test_forecast.py }
weight: 1
---
