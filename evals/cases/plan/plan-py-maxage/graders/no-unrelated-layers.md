---
type: regex
pattern: '(plugins|api/handlers|cli)/[\w/.-]+\.py:\d'
match: not_contains
target: { source: file, path: repo/.ambicode/tasks/plan-py-maxage/plan.md }
weight: 1
---
