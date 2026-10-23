---
type: regex
pattern: '(^|\n|\\n)(?!(?<=(?:^|\n)#+ *(?:What the code|Findings|Assumptions|Open decisions)[^\n]*\n(?:(?!#+ *Iteration)[\s\S])*))(?:(?:(?!\\n)[^\n])*?\b(?:add|change|edit|modify|update|extend|replace|rewrite|touch|move|rename|delete|regenerate)(?:s|d|es|ed|ing)?\b(?:(?!\\n)[^\n])*?(?:__generated__/[\w.-]+:\d|new:[^\n]*__generated__|vendor/[\w/.-]+:\d)|\s*(?:[-*]|\d+[.)]|\|)\s*[*_\x60]*[\w/.-]*?(?:__generated__/[\w.-]+:\d|new:[^\n]*__generated__|vendor/[\w/.-]+:\d))'
match: not_contains
target: { source: file, path: repo/.ambicode/tasks/plan-mono-calibrate/plan.md }
weight: 1
---
