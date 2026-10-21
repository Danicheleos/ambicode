---
type: regex
pattern: '\b([Mm]ust|[Nn]ever|[Aa]lways|MUST|NEVER|ALWAYS)\b'
match: not_contains
target: { source: file, path: .ambicode/context/conventions.md }
weight: 1
---
