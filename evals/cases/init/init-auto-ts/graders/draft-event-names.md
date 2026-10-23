---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"(?:Write|Edit|Bash)")[^\n]*\.ambicode/policies/drafts/[^\n]*([a-z]+\.[a-z]+(-[a-z]+)+|<context>\.<|past[- ]tense)'
match: contains
target: trace
weight: 1
---
