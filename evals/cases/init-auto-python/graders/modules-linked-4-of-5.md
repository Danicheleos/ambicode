---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/src/tidewatch/plugins/sources/buoy_csv\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/plugins/sources/dredge_log\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/plugins/sources/estuary_mqtt\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/plugins/sources/ferry_logger\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/plugins/sources/harbour_json\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/plugins/sources/jetty_text\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
