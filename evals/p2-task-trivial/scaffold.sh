#!/bin/sh
# Materializes the shared fixture; the suite keeps no second copy of it.
set -e
node "$(cd "$(dirname "$0")/../.." && pwd)/fixtures/materialize.mjs" ts-no-tests "$PWD/repo"
# A clean, fully committed state: this case is about implementing a trivial
# change, not reviewing one already in the working tree.
git -C "$PWD/repo" checkout -q -- .
