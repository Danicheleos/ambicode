#!/bin/sh
# Synthetic fixture from fixtures/definitions.mjs; the case keeps no copy of it.
set -e
node "$(cd "$(dirname "$0")/../../.." && pwd)/fixtures/materialize.mjs" py-clean-docstring "$PWD/repo" --ambicode-init
