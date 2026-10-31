---
type: regex
pattern: 'Task report[\s\S]*\*\*Done\*\*'
match: contains
target: { source: file, path: .ambicode/tasks/segments-void/report.md }
weight: 1
---
