---
type: regex
pattern: '(no|not|without|lacks?|missing|has none|does not (have|carry|store)|doesn''t)[^\n]{0,60}([Dd]ue ?[Dd]ate|dueDate)'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-vague/plan.md }
weight: 1
---
