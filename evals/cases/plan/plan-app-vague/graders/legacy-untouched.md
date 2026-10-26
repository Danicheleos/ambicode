---
type: regex
pattern: 'src/legacy/[\w.-]+:\d|new:\s*src/legacy'
match: not_contains
target: { source: file, path: .ambicode/tasks/plan-app-vague/plan.md }
weight: 1
---
