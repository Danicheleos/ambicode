---
type: regex
pattern: '(no|not|without|lacks?|missing|has none|does not (have|carry|store)|doesn''t|never)[^\n]{0,60}([Dd]ue ?[Dd]ate|dueDate|due day)|([Dd]ue ?[Dd]ate|dueDate|due day)[^\n]{0,120}(not|isn''t|is never|n''t be) stored'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-vague/plan.md }
weight: 1
---
