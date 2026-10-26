---
type: regex
pattern: '(^|\n|\\n)(?!(?<=(?:^|\n)#+ *(?:What the code|Findings|Assumptions|Open decisions)[^\n]*\n(?:(?!#+ *Iteration)[\s\S])*))(?:(?:(?!\\n)[^\n])*?\b(?:add|change|edit|modify|update|extend|replace|rewrite|touch|move|rename|delete|regenerate)(?:s|d|es|ed|ing)?\b(?:(?!\\n)[^\n])*?(?:contexts/(billing|notifications|catalog)/[\w/.-]+\.ts:\d)|\s*(?:[-*]|\d+[.)]|\|)\s*[*_\x60]*[\w/.-]*?(?:contexts/(billing|notifications|catalog)/[\w/.-]+\.ts:\d))'
match: not_contains
target: { source: file, path: .ambicode/tasks/plan-ts-grace/plan.md }
weight: 1
---
