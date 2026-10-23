---
type: regex
pattern: 'customers/patch\.js|FIELDS|patchable|\bpick\('
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-remind/plan.md }
weight: 2
---
