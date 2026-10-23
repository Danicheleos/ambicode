#!/bin/sh
# Synthetic fixture from fixtures/definitions.mjs; the case keeps no copy of it.
set -e
node "$(cd "$(dirname "$0")/../../../.." && pwd)/fixtures/materialize.mjs" monorepo-rust-ts-kiln-review-2 "$PWD/repo" --ambicode-init --context --policy
