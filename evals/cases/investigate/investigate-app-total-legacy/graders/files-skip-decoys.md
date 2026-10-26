---
type: regex
pattern: '(?:^|\n)#{1,6}[ \t]*Files\b[^\n]*(?:\n(?!#{1,6}[ \t])[^\n]*)*?\n[ \t]*(?:[-*]|\d+[.)])?[ \t]*[`*]*(?:src\/legacy\/invoice-total\.js|src\/legacy\/invoice-export\.js|src\/reports\/service\.js|src\/reports\/csv\.js)(?![\w/-])'
match: not_contains
target: last_message
weight: 1
---
