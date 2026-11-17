---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"(?:Write|Edit|Bash)")[^\n]*\.ambicode/policies/drafts/[^\n]*(\(deps: \w+Deps\) =>|deps\) => async|factory|curried)'
match: contains
target: trace
weight: 1
---
