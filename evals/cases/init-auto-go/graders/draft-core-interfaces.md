---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"(?:Write|Edit|Bash)")[^\n]*\.ambicode/policies/drafts/[^\n]*(core\.(Store|Tracker|Clock|Notifier|Auditor))'
match: contains
target: trace
weight: 1
---
