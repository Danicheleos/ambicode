---
type: regex
pattern: 'reservations?\.[a-z]+(-[a-z]+)+|lending\.(reservation|hold)[a-z]*(-[a-z]+)+'
match: contains
target: { source: file, path: .ambicode/tasks/plan-ts-reserve/plan.md }
weight: 1
---
