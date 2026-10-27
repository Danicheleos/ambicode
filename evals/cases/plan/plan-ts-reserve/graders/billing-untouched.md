---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:(^|\n|\\n)(?!(?<=(?:^|\n)#+ *(?:What the code|Findings|Assumptions|Open decisions)[^\n]*\n(?:(?!#+ *Iteration)[\s\S])*))\s*(?:[-*]|\d+[.)]|\|)\s*[*_\x60]*[\w/.-]*?(?:contexts/billing/[\w/.-]+\.ts:\d))'
match: not_contains
target: { source: file, path: .ambicode/tasks/plan-ts-reserve/plan.md }
weight: 1
---
