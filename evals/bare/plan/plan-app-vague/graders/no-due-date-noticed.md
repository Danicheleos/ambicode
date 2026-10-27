---
type: regex
pattern: '(no|not|without|lacks?|missing|has none|does not (have|carry|store)|doesn''t|never)[^\n]{0,60}([Dd]ue ?[Dd]ate|dueDate|due day)|([Dd]ue ?[Dd]ate|dueDate|due day)[^\n]{0,120}(not|isn''t|is never|n''t be) stored|(dueDate|[Dd]ue ?[Dd]ate|[Dd]ue day|pay-by day)\b(?:(?!\\n)[^\n]){0,120}\b(deriv|comput|calculat)\w*|\b(deriv|comput|calculat)\w*(?:(?!\\n)[^\n]){0,80}(dueDate|[Dd]ue ?[Dd]ate|[Dd]ue day|pay-by day)\b|(dueDateFor|terms\.js)(?:(?!\\n)[^\n]){0,160}(mail|print\w*|not (a )?(field|column|stored|persisted)|never stored)|dueDateFor\([^)\n]{0,60}issuedAt'
match: contains
target: last_message
weight: 1
---
