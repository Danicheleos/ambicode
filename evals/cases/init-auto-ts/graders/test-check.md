---
type: regex
pattern: '(^|\n)[^#\n]*(all|file):[^\n]*(jest|npm (run )?test)'
match: contains
target: { source: file, path: .ambicode/config.yaml }
weight: 2
---
