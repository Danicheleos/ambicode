---
type: regex
pattern: '(^|\n|\\n)(?!(?:(?!\\n)[^\n])*(\b([Nn]ot?|[Nn]ever|[Nn]one|[Nn]othing|[Ww]ithout|[Ii]nstead|[Rr]ather|[Aa]void\w*|[Uu]nrelated|[Dd]ecoy|[Ff]rozen|[Ll]egacy|[Ii]gnor\w*|[Ff]orbid\w*|[Uu]nchanged|[Uu]ntouched|[Cc]annot)\b|n''t\b))(?:(?!\\n)[^\n])*(\b(stor|persist)\w*(?:(?!\\n)[^\n]){0,80}(dueDate|[Dd]ue ?[Dd]ate|[Dd]ue day|pay-by day)\b|(dueDate|[Dd]ue ?[Dd]ate|[Dd]ue day|pay-by day)\b(?:(?!\\n)[^\n]){0,80}(\b(stor|persist)\w*|on the invoice(?! mail)|createInvoice|invoices/model)|(createInvoice|invoices/model\.js)(?:(?!\\n)[^\n]){0,120}dueDate\b)'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-remind/plan.md }
weight: 3
---
