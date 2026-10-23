---
type: regex
pattern: 'def test_forecast__rejects_window_under_one_hour'
match: contains
target: { source: file, path: repo/tests/test_forecast.py }
weight: 1
---
