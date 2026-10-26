---
type: regex
pattern: '"risk"\s*:\s*"(high|medium)"'
match: not_contains
target: { source: file, path: .ambicode/reviews/rev-14/1/answer.json }
weight: 1
---
