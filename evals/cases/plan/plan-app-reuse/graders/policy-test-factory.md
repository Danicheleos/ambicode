---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:tests/factory\.js|\bmake(Invoice|Customer|Payment)\b|\b[Ff]actory\b)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-overdue/plan.md }
weight: 1
---
