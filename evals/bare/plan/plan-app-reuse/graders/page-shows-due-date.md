---
type: regex
pattern: '(^|\n|\\n)(?!(?:(?!\\n)[^\n])*(\b([Nn]ot?|[Nn]ever|[Nn]one|[Nn]othing|[Ww]ithout|[Ii]nstead|[Rr]ather|[Aa]void\w*|[Uu]nrelated|[Dd]ecoy|[Ff]rozen|[Ll]egacy|[Ii]gnor\w*|[Ff]orbid\w*|[Uu]nchanged|[Uu]ntouched|[Cc]annot)\b|n''t\b))(?:(?!\\n)[^\n])*(\bview\b|invoices/routes\.js|\bpage\b(?:(?!\\n)[^\n]){0,80}dueDate\b|dueDate\b(?:(?!\\n)[^\n]){0,80}\bpage\b)'
match: contains
target: last_message
weight: 3
---
