#!/bin/sh
# Synthetic fixture from fixtures/definitions.mjs; the case keeps no copy of it.
set -e
node "$(cd "$(dirname "$0")/../../.." && pwd)/fixtures/materialize.mjs" eval-rules-contributing "$PWD/repo" --ambicode-init
