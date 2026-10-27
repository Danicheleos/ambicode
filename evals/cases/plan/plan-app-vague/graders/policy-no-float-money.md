---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:(^|\n|\\n)(?!(?:(?!\\n)[^\n])*(\b([Nn]ot?|[Nn]ever|[Nn]one|[Nn]othing|[Ww]ithout|[Ii]nstead|[Rr]ather|[Aa]void\w*|[Uu]nrelated|[Dd]ecoy|[Ff]rozen|[Ll]egacy|[Ii]gnor\w*|[Ff]orbid\w*|[Uu]nchanged|[Uu]ntouched|[Cc]annot)\b|n''t\b|as a decimal))(?:(?!\\n)[^\n])*(toFixed\(|parseFloat\(|\/ ?100\b))'
match: not_contains
target: { source: file, path: .ambicode/tasks/plan-app-vague/plan.md }
weight: 1
---
