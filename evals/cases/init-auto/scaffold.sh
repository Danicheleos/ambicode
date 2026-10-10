#!/bin/sh
# The session directory itself becomes the repository: /ambicode:init scaffolds the git root it runs in.
set -e
root="$(cd "$(dirname "$0")/../../.." && pwd)"
node "$root/fixtures/materialize.mjs" ts-feature-boundary "$PWD/fixture" --install
for entry in "$PWD/fixture"/* "$PWD/fixture"/.[!.]*; do [ -e "$entry" ] && mv "$entry" "$PWD"/; done
rmdir "$PWD/fixture"
