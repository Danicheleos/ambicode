---
type: regex
pattern: 'test/[\w-]+\.test\.ts'
match: contains
target: { source: file, path: .ambicode/tasks/plan-ts-grace/plan.md }
weight: 1
---
