---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:(^|\n|\\n)(?!(?<=(?:^|\n)#+ *(?:What the code|Findings|Assumptions|Open decisions)[^\n]*\n(?:(?!#+ *Iteration)[\s\S])*))\s*(?:[-*]|\d+[.)]|\|)\s*[*_\x60]*[\w/.-]*?(?:(?<![\w/.-])(engine|tools|vendor)/[\w/.-]+\.(rs|py|js|ts|toml):\d|__generated__/[\w.-]+:\d))'
match: not_contains
target: { source: file, path: .ambicode/tasks/plan-mono-degrees/plan.md }
weight: 1
---
