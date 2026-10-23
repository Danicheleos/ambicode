---
type: regex
pattern: 'bootstrap/[\w/.-]*Wiring\.kt[\s\S]*bootstrap/[\w/.-]*Main\.kt|bootstrap/[\w/.-]*Main\.kt[\s\S]*bootstrap/[\w/.-]*Wiring\.kt'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-jvm-chill/plan.md }
weight: 1
---
