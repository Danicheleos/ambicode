---
type: regex
pattern: 'test/[\w-]+\.test\.ts'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-ts-grace/plan.md }
weight: 1
---
