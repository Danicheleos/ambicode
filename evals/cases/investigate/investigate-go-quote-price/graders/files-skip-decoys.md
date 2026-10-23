---
type: regex
pattern: '(?:^|\n)#{1,6}[ \t]*Files\b[^\n]*(?:\n(?!#{1,6}[ \t])[^\n]*)*?\n[ \t]*(?:[-*]|\d+[.)])?[ \t]*[`*]*(?:repo/)?(?:internal\/routing\/zones\.go|internal\/routing\/table\.go|internal\/customs\/limits\.go)(?![\w/-])'
match: not_contains
target: last_message
weight: 1
---
