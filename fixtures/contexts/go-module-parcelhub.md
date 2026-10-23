=== overview.md
# Overview of parcelhub
## Purpose
- Parcel tracking for a depot network: scans, bays, prices, labels and returns.
## Projects
- parcelhub - . - Go module with commands under cmd/ and packages under internal/
## Stack
- go: language, go test
- golangci-lint: lint (errorlint, govet, staticcheck, unused)
=== navigation.md
# Navigation of parcelhub
## How to read
- List a package folder, open one file, Grep the name, Read with offset/limit; never Read whole large files.
## Entry points
- cmd/parceld - HTTP daemon
- cmd/parcelctl - command line
## Where things live
- shared types and interfaces: internal/core
- services and domain packages: internal/<name>, each with a doc.go
- HTTP layer: internal/httpapi with middleware/ and render/
- tests: <package>_test.go beside the code
## Naming
- one small package per concern; constructors are named New
## Grep patterns
- constructors: ^func New
=== conventions.md
# Conventions of parcelhub
## Errors
- An error returned from an exported function is wrapped with the package and function that returns it: fmt.Errorf("tracking.Lookup: %w", err). A bare err is not returned.
## Time
- time.Now is called only inside internal/clock; other code takes a core.Clock and calls clock.Now().
## Constructors
- Constructors take interfaces from internal/core, such as core.Store and core.Clock: func New(store core.Store, clock core.Clock) *Service.
## Interfaces
- A type states the interface it satisfies with var _ core.Store = (*Store)(nil).
## Checks
- go test ./..., go vet ./... and golangci-lint run pass.
