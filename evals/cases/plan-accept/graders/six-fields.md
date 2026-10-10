---
type: regex
pattern: 'Goal[\s\S]*Changes[\s\S]*Tests[\s\S]*Accept[\s\S]*Checks[\s\S]*Leaves out'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-due/steps/plan-body.md }
weight: 1
---
