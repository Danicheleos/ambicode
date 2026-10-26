---
type: regex
pattern: 'tests/factory\.js|make(Invoice|Customer|Payment)\(|\b[Ff]actory\b'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-overdue/plan.md }
weight: 1
---
