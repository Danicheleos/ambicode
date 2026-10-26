#!/bin/sh
# Synthetic fixture from fixtures/definitions.mjs; the case keeps no copy of it. The session directory becomes the repository.
set -e
node "$(cd "$(dirname "$0")/../../../.." && pwd)/fixtures/materialize.mjs" ts-app-medium "$PWD/fixture" --ambicode-init --context
for entry in "$PWD/fixture"/* "$PWD/fixture"/.[!.]*; do [ -e "$entry" ] && mv "$entry" "$PWD"/; done
rmdir "$PWD/fixture"
