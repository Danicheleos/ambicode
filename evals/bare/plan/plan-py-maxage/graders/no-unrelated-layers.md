---
type: regex
pattern: '(^|\n|\\n)(?!(?<=(?:^|\n)#+ *(?:What the code|Findings|Assumptions|Open decisions)[^\n]*\n(?:(?!#+ *Iteration)[\s\S])*))(?:(?:(?!\\n)[^\n])*?\b(?:add|change|edit|modify|update|extend|replace|rewrite|touch|move|rename|delete|regenerate)(?:s|d|es|ed|ing)?\b(?:(?!\\n)[^\n])*?(?:(plugins|api/handlers|cli)/[\w/.-]+\.py:\d)|\s*(?:[-*]|\d+[.)]|\|)\s*[*_\x60]*[\w/.-]*?(?:(plugins|api/handlers|cli)/[\w/.-]+\.py:\d))'
match: not_contains
target: last_message
weight: 1
---
