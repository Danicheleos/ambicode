---
type: regex
pattern: '(?:^|\n)#{1,6}[ \t]*Files\b[^\n]*(?:\n(?!#{1,6}[ \t])[^\n]*)*?\n[ \t]*(?:[-*]|\d+[.)])?[ \t]*[`*]*(?:repo/)?(?:src\/reports\/aging\.js|src\/reports\/top-customers\.js|src\/legacy\/invoice-total\.js)(?![\w/-])'
match: not_contains
target: last_message
weight: 1
---
