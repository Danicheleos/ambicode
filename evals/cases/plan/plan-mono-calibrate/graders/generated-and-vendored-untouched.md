---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:(^|\n|\\n)(?!(?<=(?:^|\n)#+ *(?:What the code|Findings|Assumptions|Open decisions)[^\n]*\n(?:(?!#+ *Iteration)[\s\S])*))\s*(?:[-*]|\d+[.)]|\|)\s*[*_\x60]*[\w/.-]*?(?:__generated__/[\w.-]+:\d|new:[^\n]*__generated__|vendor/[\w/.-]+:\d))'
match: not_contains
target: { source: file, path: .ambicode/tasks/plan-mono-calibrate/plan.md }
weight: 1
---
