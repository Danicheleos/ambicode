---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"(?:Write|Edit|Bash)")[^\n]*\.ambicode/policies/drafts/[^\n]*(operator fun invoke|override fun invoke|invoke\()'
match: contains
target: trace
weight: 1
---
