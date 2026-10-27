---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:(aging|bucketFor)[^\n]{0,120}(issue|issuedAt)|(issue|issuedAt)[^\n]{0,120}(aging|bucketFor))'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-vague/plan.md }
weight: 1
---
