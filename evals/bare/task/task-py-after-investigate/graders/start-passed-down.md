---
type: regex
pattern: 'build_window\([^)]*start=start'
match: contains
target: { source: file, path: src/tidewatch/app/queries/forecast.py }
weight: 1
---
