=== overview.md
# Overview of seedvault
## Purpose
- Seed bank: lots are registered, stored in vaults, sown into trays and reported on.
## Projects
- seedvault - . - Kotlin on Gradle, hexagonal across domain, application, four adapters and bootstrap
## Stack
- kotlin: language
- junit: tests (./gradlew test)
- ktlint: lint (./gradlew ktlintCheck)
=== navigation.md
# Navigation of seedvault
## How to read
- List a subproject folder, open one file, Grep the name, Read with offset/limit; never Read whole large files.
## Entry points
- bootstrap/src/main/kotlin/org/seedvault/bootstrap/Main.kt - process entry
- bootstrap/src/main/kotlin/org/seedvault/bootstrap/Wiring.kt - builds every service
## Where things live
- domain model, rules and events: domain/src/main
- input and output ports and use case services: application/src/main (port/, usecase/)
- adapters: adapters/persistence, adapters/rest, adapters/messaging, adapters/cli
- tests: <subproject>/src/test
## Naming
- a use case service is named <Verb><Noun>Service and implements an input port of the same verb
## Grep patterns
- services: ^class \w+Service
=== conventions.md
# Conventions of seedvault
## Types
- Identifiers are value classes (LotId, SpeciesId), not a bare String in a signature. The raw text is unwrapped with .value only at the edge, where a log line or a file name needs it.
## Failures
- A failure the caller can expect, such as an unknown lot or an expired one, is returned as Outcome.Rejected. Exceptions are for bugs and are not caught to drive logic.
## Checks
- ./gradlew test and ./gradlew ktlintCheck pass before a merge request is opened.
