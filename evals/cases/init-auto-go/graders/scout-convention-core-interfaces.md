---
type: regex
pattern: '(core\.(Store|Tracker|Clock|Notifier|Auditor))'
match: contains
target: { source: file, path: .ambicode/context/conventions.md }
weight: 1
---
