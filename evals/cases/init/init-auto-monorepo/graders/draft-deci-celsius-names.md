---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"(?:Write|Edit|Bash)")[^\n]*\.ambicode/policies/drafts/[^\n]*(_dc\b|\b\w+Dc\b|tenths of a degree)'
match: contains
target: trace
weight: 1
---
