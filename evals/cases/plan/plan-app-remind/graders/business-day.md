---
type: regex
pattern: 'businessDay|Europe/Berlin|config\.timeZone'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-remind/plan.md }
weight: 3
---
