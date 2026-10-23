---
type: regex
pattern: '(?:^|\n)#{1,6}[ \t]*Files\b[^\n]*(?:\n(?!#{1,6}[ \t])[^\n]*)*?\n[ \t]*(?:[-*]|\d+[.)])?[ \t]*[`*]*(?:repo/)?(?:engine\/crates\/schedule\/src\/ramp\/linear\.rs|engine\/crates\/schedule\/src\/ramp\/curve\.rs|engine\/crates\/controller\/src\/relay\.rs|engine\/crates\/controller\/src\/drivers\/relay_board\.rs|engine\/crates\/controller\/src\/drivers\/thermocouple\.rs)(?![\w/-])'
match: not_contains
target: last_message
weight: 1
---
