---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:(^|\n|\\n)(?!(?:(?!\\n)[^\n])*(\b([Nn]ot?|[Nn]ever|[Nn]one|[Nn]othing|[Ww]ithout|[Ii]nstead|[Rr]ather|[Aa]void\w*|[Uu]nrelated|[Dd]ecoy|[Ff]rozen|[Ll]egacy|[Ii]gnor\w*|[Ff]orbid\w*|[Uu]nchanged|[Uu]ntouched|[Cc]annot)\b|n''t\b))(?:(?!\\n)[^\n])*(\bnew Error\())'
match: not_contains
target: { source: file, path: .ambicode/tasks/plan-app-overdue/plan.md }
weight: 1
---
