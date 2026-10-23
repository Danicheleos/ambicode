---
type: regex
pattern: '(?:^|\n)#{1,6}[ \t]*Files\b[^\n]*(?:\n(?!#{1,6}[ \t])[^\n]*)*?\n[ \t]*(?:[-*]|\d+[.)])?[ \t]*[`*]*(?:repo/)?(?:src\/flags\.js|src\/legacy\/payment-hooks\.js|src\/notifications\/service\.js|src\/customers\/repository\.js)(?![\w/-])'
match: not_contains
target: last_message
weight: 1
---
