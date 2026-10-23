=== overview.md
# Overview of kiln
## Purpose
- Controller for a pottery kiln: schedules, safety limits, a control loop, a web dashboard and calibration tools.
## Projects
- engine - engine - Rust workspace of crates under engine/crates
- dashboard - dashboard - TypeScript Express app with a generated engine client
- tools - tools - Python helpers that calibrate thermocouples
## Stack
- cargo: engine tests and clippy
- vitest: dashboard tests (npm test)
- pytest: tools tests
=== navigation.md
# Navigation of kiln
## How to read
- List a project folder, open one file, Grep the name, Read with offset/limit; never Read whole large files.
## Entry points
- engine/crates/cli/src/main.rs - simulation command line
- dashboard/src/server.ts - web server
## Where things live
- engine crates: engine/crates/<crate>/src
- dashboard routes, services, views and lib: dashboard/src
- generated engine client: dashboard/src/__generated__
- vendored code: vendor
## Naming
- dashboard route modules are <area>.routes.ts and export register(app)
## Grep patterns
- route modules: ^export function register
=== conventions.md
# Conventions of kiln
## Units
- A temperature that is a setpoint or a reading is an integer in tenths of a degree Celsius, and its name ends in _dc in Rust and Python or Dc and _DC in TypeScript (target_dc, targetDc, MAX_SETPOINT_DC). Degrees appear only at the display edge.
## Rust
- Rust code outside tests has no bare unwrap(); it uses .expect("invariant: ...") and states the invariant that makes the failure impossible. Each crate error type implements std::error::Error.
## Dashboard
- Each routes module exports register(app) and the app calls it.
## Generated and vendored code
- dashboard/src/__generated__/ and vendor/ are regenerated or re-vendored, not edited by hand.
## Checks
- Each project passes the checks listed in the README before review.
