---
type: regex
pattern: 'tests/factory\.js|make(Invoice|Customer|Payment)\(|\b[Ff]actory\b'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-overdue/plan.md }
weight: 1
---
