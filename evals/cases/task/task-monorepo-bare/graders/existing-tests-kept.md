---
type: regex
pattern: 'test_fit_averages_the_differences[\s\S]*test_csv_lists_kilns_in_order'
match: contains
target: { source: file, path: tools/tests/test_calibration.py }
weight: 1
---
