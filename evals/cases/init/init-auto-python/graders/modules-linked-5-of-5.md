---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/src/tidewatch/plugins/sources/lock_gate\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/plugins/sources/marina_modbus\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/plugins/sources/mooring_pins\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/plugins/sources/pier_xml\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/plugins/sources/quay_serial\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/plugins/sources/weir_levels\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
