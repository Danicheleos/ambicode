=== overview.md
# Overview of the fixture repository
## Purpose
- Small TypeScript app with invoices, users, reports and routes.
## Projects
- app - . - TypeScript sources under src/, jest tests under tests/
## Stack
- eslint: lint
- jest: tests
- typescript: language
=== navigation.md
# Navigation of the fixture repository
## How to read
- List the module file, open one file, Grep the name, Read with offset/limit; never Read whole large files.
## Entry points
- src/app.ts - application entry
## Where things live
- HTTP route definitions: src/routes/
- domain records and logic: src/<feature>/{model,service}.ts
- tests: tests/<feature>.test.ts
## Naming
- features are directories under src/ with model.ts and service.ts
## Grep patterns
- exports: ^export 
=== conventions.md
# Conventions of the fixture repository
## Code
- Feature code sits in src/<feature>/model.ts and src/<feature>/service.ts.
## Errors
## Tests
- Tests sit in tests/<feature>.test.ts.
## Imports
=== modules/invoices.md
# invoices module
## Purpose
- Invoice record type and invoice logic.
## Key files
- src/invoices/model.ts - record type - items: Invoice
- src/invoices/service.ts - invoice logic - items: total
## Depends on
## Gotchas
=== modules/legacy.md
# legacy module
## Purpose
- Older code kept for compatibility.
## Key files
- src/legacy/invoice-export.ts - old invoice export - items: legacyInvoiceExport
## Depends on
## Gotchas
=== modules/reports.md
# reports module
## Purpose
- Reporting.
## Key files
- src/reports/monthly.ts - monthly report - items: monthly
## Depends on
## Gotchas
=== modules/routes.md
# routes module
## Purpose
- Route definitions per feature.
## Key files
- src/routes/invoices.ts - invoices route - items: invoicesRoute
- src/routes/users.ts - users route - items: usersRoute
## Depends on
## Gotchas
=== modules/users.md
# users module
## Purpose
- User record type and user logic.
## Key files
- src/users/model.ts - record type - items: User
- src/users/service.ts - user logic - items: rename
## Depends on
## Gotchas
