---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:bootstrap/[\w/.-]*Wiring\.kt[\s\S]*bootstrap/[\w/.-]*Main\.kt|bootstrap/[\w/.-]*Main\.kt[\s\S]*bootstrap/[\w/.-]*Wiring\.kt)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-jvm-chill/plan.md }
weight: 1
---
