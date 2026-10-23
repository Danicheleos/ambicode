---
type: regex
pattern: 'overdueReminders|reports/aging\.js|bucketFor'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-vague/plan.md }
weight: 1
---
