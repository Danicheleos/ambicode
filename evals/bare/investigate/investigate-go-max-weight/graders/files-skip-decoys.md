---
type: regex
pattern: '(?:^|\n)#{1,6}[ \t]*Files\b[^\n]*(?:\n(?!#{1,6}[ \t])[^\n]*)*?\n[ \t]*(?:[-*]|\d+[.)])?[ \t]*[`*]*(?:repo/)?(?:internal\/customs\/limits\.go|internal\/carrier\/regional\/sortline\/belt\/sensor\/thresholds\.go)(?![\w/-])'
match: not_contains
target: last_message
weight: 1
---
