---
type: regex
pattern: 'notifications/service\.js|deliver\('
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-remind/plan.md }
weight: 1
---
