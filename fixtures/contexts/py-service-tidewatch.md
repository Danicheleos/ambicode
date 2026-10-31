=== overview.md
# Overview of tidewatch
## Purpose
- Tide windows for harbour pilots: readings from gauges are ingested, checked for freshness and turned into forecast windows.
## Projects
- tidewatch - . - Python package under src/tidewatch, pytest tests under tests/
## Stack
- python: language, layers domain, app, infra and api
- pytest: tests
- ruff: lint
=== navigation.md
# Navigation of tidewatch
## How to read
- List a package folder, open one file, Grep the name, Read with offset/limit; never Read whole large files.
## Entry points
- src/tidewatch/cli/main.py - command line
- src/tidewatch/infra/wiring.py - builds the services
## Where things live
- domain rules, models, errors and events: src/tidewatch/domain
- use cases: src/tidewatch/app/commands and src/tidewatch/app/queries
- handlers shaped like requests: src/tidewatch/api/handlers
- feed adapters: src/tidewatch/plugins/sources/<name>/{parse.py,plugin.py}
- tests: tests/test_<module>.py with shared fixtures in tests/conftest.py
## Naming
- one module per endpoint in api/handlers; one folder per feed adapter
## Grep patterns
- adapters: ^PLUGIN = 
=== conventions.md
# Conventions of tidewatch
## Errors
- Every error raised in src/tidewatch is a TidewatchError subclass whose first argument is a TW-nnn code, for example raise StaleReadingError("TW-203", ...). Codes are not reused.
## Tests
- Tests are named test_<module>__<behaviour> with a double underscore, for example test_staleness__rejects_stale_reading. One behaviour per test; fixture data lives in tests/conftest.py.
## Signatures
- Parameters after the first are keyword-only: def tide_window(services, gauge_id, *, start, hours).
## Plugins
- Each adapter folder ends plugin.py with PLUGIN = SourcePlugin(name=..., parse=...).
## Checks
- pytest and ruff check are clean before a change is ready.
