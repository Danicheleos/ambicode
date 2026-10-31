=== overview.md
# Overview of the fixture repository
## Purpose
- Small TypeScript service for invoices and payments.
## Projects
- app - . - TypeScript sources under src/, jest tests under tests/
## Stack
- jest: tests
- typescript: language
=== navigation.md
# Navigation of the fixture repository
## How to read
- List the module file, open one file, Grep the name, Read with offset/limit; never Read whole large files.
## Entry points
- src/services/payments.ts - applying a payment
## Where things live
- business logic: src/services/
- persistence: src/stores/
- records: src/models/
- tests: tests/<service>.test.ts
## Naming
- one file per service, store and model
## Grep patterns
- exports: ^export 
=== conventions.md
# Conventions of the fixture repository
## Code
- Services call the stores; models are plain records.
## Errors
## Tests
- Tests sit in tests/<service>.test.ts.
## Imports
=== modules/services.md
# services module
## Purpose
- Invoice and payment logic.
## Key files
- src/services/payments.ts - apply a payment - items: applyPayment
- src/services/invoices.ts - create an invoice - items: createInvoice
## Depends on
## Gotchas
=== modules/tests.md
# tests module
## Purpose
- Jest tests of the services.
## Key files
- tests/payments.test.ts - payment tests - items: applyPayment
- tests/invoices.test.ts - invoice tests - items: createInvoice
## Depends on
## Gotchas
=== index.md
# Index
- [services](modules/services.md)
- [tests](modules/tests.md)
