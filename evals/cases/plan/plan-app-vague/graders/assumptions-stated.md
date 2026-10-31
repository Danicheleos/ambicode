---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:[Aa]ssum|[Oo]pen decision)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-vague/plan.md }
weight: 1
---
