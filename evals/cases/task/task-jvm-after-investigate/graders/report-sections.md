---
type: regex
pattern: 'Task report[\s\S]*\*\*Done\*\*'
match: contains
target: { source: file, path: .ambicode/tasks/sv-floor/report.md }
weight: 1
---
