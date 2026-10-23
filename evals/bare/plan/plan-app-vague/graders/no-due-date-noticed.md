---
type: regex
pattern: '(no|not|without|lacks?|missing|has none|does not (have|carry|store)|doesn''t)[^\n]{0,60}([Dd]ue ?[Dd]ate|dueDate)'
match: contains
target: last_message
weight: 1
---
