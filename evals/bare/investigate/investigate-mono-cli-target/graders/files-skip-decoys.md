---
type: regex
pattern: '## Files[\s\S]*(engine\/crates\/schedule\/src\/ramp\/linear\.rs|engine\/crates\/schedule\/src\/ramp\/curve\.rs|engine\/crates\/controller\/src\/relay\.rs|engine\/crates\/controller\/src\/drivers\/relay_board\.rs|engine\/crates\/controller\/src\/drivers\/thermocouple\.rs)'
match: not_contains
target: last_message
weight: 1
---
