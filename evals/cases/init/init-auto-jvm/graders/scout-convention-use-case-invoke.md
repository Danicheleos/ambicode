---
type: regex
pattern: '(operator fun invoke|override fun invoke|invoke\()'
match: contains
target: { source: file, path: .ambicode/context/conventions.md }
weight: 1
---
