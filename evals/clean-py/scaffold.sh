#!/bin/sh
# Materializes the shared fixture; the suite keeps no second copy of it.
set -e
node "$(cd "$(dirname "$0")/../.." && pwd)/fixtures/materialize.mjs" py-clean-docstring "$PWD/repo"
