---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"(?:Write|Edit|Bash)")[^\n]*\.ambicode/policies/drafts/[^\n]*(SourcePlugin\(|\bPLUGIN\b)'
match: contains
target: trace
weight: 1
---
