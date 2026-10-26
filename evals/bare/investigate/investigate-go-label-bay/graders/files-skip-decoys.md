---
type: regex
pattern: '(?:^|\n)#{1,6}[ \t]*Files\b[^\n]*(?:\n(?!#{1,6}[ \t])[^\n]*)*?\n[ \t]*(?:[-*]|\d+[.)])?[ \t]*[`*]*(?:internal\/depot\/bays\.go|internal\/depot\/planner\.go|internal\/routing\/zones\.go|internal\/labels\/barcode\.go)(?![\w/-])'
match: not_contains
target: last_message
weight: 1
---
