#!/bin/sh
# The session directory itself becomes the repository: /ambicode:init scaffolds the git root it runs in.
set -e
node "$(cd "$(dirname "$0")/../../.." && pwd)/fixtures/materialize.mjs" monorepo-rust-ts-kiln "$PWD/fixture" 
for entry in "$PWD/fixture"/* "$PWD/fixture"/.[!.]*; do [ -e "$entry" ] && mv "$entry" "$PWD"/; done
rmdir "$PWD/fixture"
