---
type: regex
pattern: '(^|\n|\\n)(?!(?<=(?:^|\n)#+ *(?:What the code|Findings|Assumptions|Open decisions)[^\n]*\n(?:(?!#+ *Iteration)[\s\S])*))\s*(?:[-*]|\d+[.)]|\|)\s*[*_\x60]*[\w/.-]*?(?:contexts/(billing|notifications|catalog)/[\w/.-]+\.ts:\d)'
match: not_contains
target: last_message
weight: 1
---
