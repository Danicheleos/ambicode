---
type: regex
pattern: 'tests/factory\.js|make(Invoice|Customer|Payment)\(|\b[Ff]actory\b'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-vague/plan.md }
weight: 1
---
