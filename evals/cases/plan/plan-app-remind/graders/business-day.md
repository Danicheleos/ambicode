---
type: regex
pattern: 'businessDay|Europe/Berlin|config\.timeZone'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-remind/plan.md }
weight: 3
---
