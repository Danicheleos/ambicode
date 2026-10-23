---
type: regex
pattern: 'def test_forecast__\w*start'
match: contains
target: { source: file, path: repo/tests/test_forecast.py }
weight: 1
---
