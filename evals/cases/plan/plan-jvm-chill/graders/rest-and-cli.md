---
type: regex
pattern: 'adapters/rest[\s\S]*adapters/cli|adapters/cli[\s\S]*adapters/rest'
match: contains
target: { source: file, path: .ambicode/tasks/plan-jvm-chill/plan.md }
weight: 1
---
