---
type: regex
pattern: '(register\(app|export function register)'
match: contains
target: { source: file, path: .ambicode/context/conventions.md }
weight: 1
---
