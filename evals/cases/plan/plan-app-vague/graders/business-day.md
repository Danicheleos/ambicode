---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:businessDay|Europe/Berlin|config\.timeZone)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-vague/plan.md }
weight: 2
---
