---
type: regex
pattern: '(Result<\w+, DomainError>|create[A-Z]\w*\()'
match: contains
target: { source: file, path: .ambicode/context/conventions.md }
weight: 1
---
