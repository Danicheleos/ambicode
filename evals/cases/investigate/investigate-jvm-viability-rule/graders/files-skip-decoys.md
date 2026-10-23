---
type: regex
pattern: '(?:^|\n)#{1,6}[ \t]*Files\b[^\n]*(?:\n(?!#{1,6}[ \t])[^\n]*)*?\n[ \t]*(?:[-*]|\d+[.)])?[ \t]*[`*]*(?:repo/)?(?:application\/src\/main\/kotlin\/org\/seedvault\/application\/usecase\/report\/ViabilityBands\.kt)(?![\w/-])'
match: not_contains
target: last_message
weight: 1
---
