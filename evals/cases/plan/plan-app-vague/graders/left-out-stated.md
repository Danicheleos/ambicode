---
type: regex
pattern: '[Ll]eaves? out|[Ll]eft out|[Oo]ut of scope|[Oo]pen decision|[Nn]ot (in|part of) (this|scope)|[Nn]ot covered|[Dd]eferred|[Ff]ollow-?up'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-vague/plan.md }
weight: 1
---
