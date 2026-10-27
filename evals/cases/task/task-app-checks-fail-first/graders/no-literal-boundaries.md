---
type: regex
pattern: '(?:^|\n)[^\n/*]*\b(60|90)\b'
match: not_contains
target: { source: file, path: src/reports/aging.js }
weight: 1
---
