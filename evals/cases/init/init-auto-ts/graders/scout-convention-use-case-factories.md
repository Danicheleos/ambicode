---
type: regex
pattern: '(\(deps: \w+Deps\) =>|deps\) => async|factory|curried)'
match: contains
target: { source: file, path: .ambicode/context/conventions.md }
weight: 1
---
