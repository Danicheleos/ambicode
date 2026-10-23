---
type: regex
pattern: '(^|\n)/?\.ambicode/?\s*(\n|$)'
match: contains
target: { source: file, path: .gitignore }
weight: 1
---
