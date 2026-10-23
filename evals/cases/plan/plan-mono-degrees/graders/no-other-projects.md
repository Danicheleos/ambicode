---
type: regex
pattern: '(engine|tools|vendor)/[\w/.-]+\.(rs|py|js|ts|toml):\d|__generated__/[\w.-]+:\d'
match: not_contains
target: { source: file, path: repo/.ambicode/tasks/plan-mono-degrees/plan.md }
weight: 1
---
