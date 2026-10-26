---
type: regex
pattern: 'last\w*[Rr]emind\w*|[Rr]emind\w*(At|On|Day|Date)\b|forCustomer|notifications/repository\.js|sentAt'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-remind/plan.md }
weight: 1
---
