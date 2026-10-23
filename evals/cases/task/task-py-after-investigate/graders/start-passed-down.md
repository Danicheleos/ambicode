---
type: regex
pattern: 'build_window\([^)]*start=start'
match: contains
target: { source: file, path: repo/src/tidewatch/app/queries/forecast.py }
weight: 1
---
