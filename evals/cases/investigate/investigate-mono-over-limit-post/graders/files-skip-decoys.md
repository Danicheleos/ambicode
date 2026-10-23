---
type: regex
pattern: '(?:^|\n)#{1,6}[ \t]*Files\b[^\n]*(?:\n(?!#{1,6}[ \t])[^\n]*)*?\n[ \t]*(?:[-*]|\d+[.)])?[ \t]*[`*]*(?:repo/)?(?:engine\/crates\/safety\/src\/limits\.rs|engine\/crates\/schedule\/src\/plan\.rs|dashboard\/src\/lib\/engine\/client\.ts|dashboard\/src\/services\/alerts\/rules\.ts)(?![\w/-])'
match: not_contains
target: last_message
weight: 1
---
