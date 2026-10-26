---
type: regex
pattern: '(^|\n|\\n)(?!(?:(?!\\n)[^\n])*(\b([Nn]ot?|[Nn]ever|[Nn]one|[Nn]othing|[Ww]ithout|[Ii]nstead|[Rr]ather|[Aa]void\w*|[Uu]nrelated|[Dd]ecoy|[Ff]rozen|[Ll]egacy|[Ii]gnor\w*|[Ff]orbid\w*|[Uu]nchanged|[Uu]ntouched|[Cc]annot)\b|n''t\b|setup\.js|already))(?:(?!\\n)[^\n])*(\b(db|flags|clock|bus|channels)\.(reset|clear|clearOutbox)\()'
match: not_contains
target: { source: file, path: .ambicode/tasks/plan-app-remind/plan.md }
weight: 1
---
