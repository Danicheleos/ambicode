=== overview.md
# Overview of lendbox
## Purpose
- Back end of a community tool library: members borrow tools, late returns cost a fee, and the fees are invoiced.
## Projects
- lendbox - . - TypeScript service under src/, jest tests under test/
## Stack
- typescript: language, NodeNext modules with .js import suffixes
- jest: tests (npm test)
- eslint: lint (npm run lint)
=== navigation.md
# Navigation of lendbox
## How to read
- List a context folder, open one file, Grep the name, Read with offset/limit; never Read whole large files.
## Entry points
- src/main.ts - process entry
- src/composition.ts - the only file that wires contexts together
## Where things live
- bounded contexts: src/contexts/<context>/{domain,application,http} with an index.ts at the root of each
- shared kernel: src/shared-kernel (ids, money, time, result, events)
- platform: src/platform (http, config, logging, db)
- tests: test/<behaviour>.test.ts
## Naming
- files are kebab-case; a use case file is named after its verb (add-item.ts, return.ts)
## Grep patterns
- exports of a context: ^export in src/contexts/<context>/index.ts
=== conventions.md
# Conventions of lendbox
## Boundaries
- A context is reached through its index.ts; nothing outside src/contexts/lending/ imports from src/contexts/lending/domain/, application/ or http/.
## Events
- Event names are <context>.<past-tense-verb> in kebab case, for example lending.loan-returned. A context reacts to another one by event name, not by importing its code.
## Use cases
- A use case is a factory that takes its dependencies first: export const addItem = (deps: CatalogDeps) => async (input: AddItemInput).
## Domain
- Entities are built by createX functions that return Result<Entity, DomainError>, for example createLoan.
## Checks
- npm test and npm run lint pass before a merge request is opened.
