---
type: regex
pattern: '(std::error::Error|impl\s+(std::)?(error::)?Error for)'
match: contains
target: { source: file, path: .ambicode/context/conventions.md }
weight: 1
---
