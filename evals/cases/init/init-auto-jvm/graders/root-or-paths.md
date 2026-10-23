---
type: regex
pattern: '(^|\n)[^#\n]*paths:[\s\S]{0,40}(?<![\w/-])(domain|domain/src|domain/src/main|application|application/src|application/src/main|adapters|adapters/persistence|adapters/persistence/src|adapters/persistence/src/main|adapters/rest|adapters/rest/src|adapters/rest/src/main|adapters/messaging|adapters/messaging/src|adapters/messaging/src/main|adapters/cli|adapters/cli/src|adapters/cli/src/main|bootstrap|bootstrap/src|bootstrap/src/main)(?![\w-])'
match: contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
