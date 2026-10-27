---
type: regex
pattern: 'test_forecast__rejects_window_over_two_days'
match: contains
target: { source: file, path: tests/test_forecast.py }
weight: 1
---
