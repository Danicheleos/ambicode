---
type: regex
pattern: '(^|\n|\\n)(?!(?:(?!\\n)[^\n])*(\b([Nn]ot?|[Nn]ever|[Nn]one|[Nn]othing|[Ww]ithout|[Ii]nstead|[Rr]ather|[Aa]void\w*|[Uu]nrelated|[Dd]ecoy|[Ff]rozen|[Ll]egacy|[Ii]gnor\w*|[Ff]orbid\w*|[Uu]nchanged|[Uu]ntouched|[Cc]annot)\b|n''t\b))(?:(?!\\n)[^\n])*(\bview\b|[Vv]oid(?:(?!\\n)[^\n]){0,120}(\b0\b|0\.00|zero)|(\b0\b|0\.00|zero)(?:(?!\\n)[^\n]){0,120}[Vv]oid)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-csv/plan.md }
weight: 3
---
