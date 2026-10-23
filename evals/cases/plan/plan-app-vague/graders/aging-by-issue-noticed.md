---
type: regex
pattern: '(aging|bucketFor)[^\n]{0,120}(issue|issuedAt)|(issue|issuedAt)[^\n]{0,120}(aging|bucketFor)'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-vague/plan.md }
weight: 1
---
