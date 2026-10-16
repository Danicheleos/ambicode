# Phase 1 ($0 part): fixture ts-app-medium and four cases (2026-10-12)

Nothing paid was run. The cases are generated and statically checked only; bare/plugin scores are not measured yet.

## Fixture

`fixtures/app-medium.mjs` (file contents, edited by hand) and three fixtures in `fixtures/definitions.mjs`:

| Fixture | Tree | Used by |
| --- | --- | --- |
| `ts-app-medium` | base, 5 commits (shared/customers/invoices, payments, notifications, reports, app) | investigate-trace, plan-reuse |
| `ts-app-medium-refund-bug` | base with 2 source files replaced and 4 refund tests left out, committed | task-multi |
| `ts-app-medium-money-change` | base plus an uncommitted change to `src/shared/money.js` and its test | review-subtle |

Plain CommonJS, not ESM: jest 30 in this lockfile runs it with no build step, and `eval-page-bug` does the same. The manifest is
`JEST_MANIFEST` plus `scripts.test`, `scripts.lint` and a jest setup file; `npm ci` accepts it against the existing lockfile.

Layout: `src/{customers,invoices,payments,notifications,reports}/{routes,service,repository,model}.js` plus small helpers,
`src/shared/{money,validation/*,errors/*,events/{bus,topics},http,...}`, `src/legacy/` (frozen duplicate), `src/flags.js`,
`tests/` with `factory.js` and `setup.js`, `CONTRIBUTING.md` (AppError subclasses, shared validators, integer cents,
tests use the factory), an eslint rule (`no-restricted-syntax`, warn) against `throw new Error`.

Decoys:
- `total` in `invoices/service`, `legacy/invoice-total`, `reports/service`.
- `legacy/payment-hooks.js` sends a receipt directly and is imported by nothing.
- `invoices/service.create` calls `notifications/service` directly (invoice-created mail), the payment path does not.
- `payments/installments.js` has a `dueDate`, but on installments, not invoices.
- `reports/service.js` has its own `groupBy` next to `shared/collections.groupBy`.

## Cases (all version 1)

### investigate-trace (ts-app-medium, `--ambicode-init`)
Prompt: "What happens when a payment is recorded, from the API call until the customer is notified? Cite path:line for each claim. End your answer with a ## Files section ..."
- Shared: cites-service, cites-handler, names-the-event (`payment.received`), no-edit, no-write-source, llm answer-correct, files metrics.
- Plugin only: route-started, note-saved, citations-valid, route-done.
- Trap for bare: `payments/service` imports nothing from notifications; grepping "notif" from payments finds nothing, `legacy/payment-hooks.js` looks like the answer, and `invoices/service` has a direct notification call. The chain needs the bus, `notifications/index.js` and `app.js`.
- Metrics: 7 relevant files (payments routes/service, bus, notifications index/handlers/service/channels), 9 allowed.

### plan-reuse (ts-app-medium, `--ambicode-init`)
Prompt: add `dueDate` to invoices, reject a dueDate before issuedAt, add a report of overdue invoices with the outstanding amount.
- Shared: no-edit, no-write-source, no-checks-run, llm plan-quality (plan body in the plugin arm, final message in bare).
- Plugin only: plan-body-written, five-fields, anchors-present, anchors-valid, plan-promoted, route-done.
- Trap for bare: a plan that writes its own date comparison, a new report module, or reuses `installments.dueDate` or `legacy/invoice-total`. The right plan uses `validateDate`/`validateRange(dueDate, {min: issuedAt})`, `reports/*` (`aging.daysBetween`, `unpaidInvoices`), `invoices.outstanding`, `money.sum`.

### task-multi (ts-app-medium-refund-bug, `--ambicode-init --install`)
Prompt: after pay 1106 / refund 300 the invoice is still `paid`; an over-refund answers 500, not a client error; put the regression test in `tests/payments/payments.test.js`.
- Defect: `payments/repository.netPaidCents` adds refunds, `payments/service.refund` never calls `invoices.syncStatus`, and its guard throws a bare `Error` (HTTP 500).
- Shared: existing-tests-kept, no-bare-error (`throw new Error(` absent from the service), llm repository-fixed, status-synced, error-type, test-added, test-uses-factory.
- Shared: no-git-mutation (both arms). Plugin only: format-recorded, reviewer-invoked, review-recorded, route-done, report-sections.
- Trap for bare: fixing one file leaves the status stale or the sum wrong; the convention (PaymentError, factory) is only in CONTRIBUTING.md and `src/shared/errors`.

### review-subtle (ts-app-medium-money-change, `--ambicode-init`, no `--install`)
Prompt: "Review the uncommitted change in the repository at `repo/`." (plugin: `/ambicode:review --task rev-money --headless --answer estimate=run`).
- Diff: `money.round` becomes half-to-even and gains `throw new Error('round: not a number')`; its own tests are updated and pass.
- Breakage: `invoices/service.taxFor` (1005 at 1000 bps gives 100, not 101) and `reports/service.averageInvoiceCents`, neither in the diff. `percentOf` uses `Math.round` directly and is unaffected (a no-false-defect check).
- Shared: no-edit, no-write-source, cites-caller, llm finding-correct, convention-finding, no-false-defect.
- Plugin only: reviewer-invoked, review-recorded, finding-recorded, route-done, part4-fenced.
- No install on purpose: with jest present a bare reviewer would run the suite and see 13 failures. Without it the caller has to be found by grep.

## Verified (all $0)

```
ts-app-medium            120 tracked files, 2491 lines in src+tests (2545 with config and docs); npm test: 39 suites, 185 tests pass; npm run lint: 0 warnings
ts-app-medium-refund-bug npm test: 39 suites, 181 tests pass; lint: 1 warning (the bare Error); repro: partial refund of 300 -> status paid, paidCents 1106; over-refund -> http 500
ts-app-medium-money-change  git diff: 2 files, +15 -4; npm test: 7 suites / 13 tests fail (callers outside the diff); money.test.js passes
```

On the base tree the same repro gives partially_paid / 806 and 422. `--install` leaves git clean, and `--ambicode-init` commits the config before the
uncommitted change. `node --test evals/scripts/*.test.mjs fixtures/*.test.mjs`: 69 pass.

## Audit fixes (2026-10-13)

A simulated-answer audit found measurement bugs; fixed in `evals/scripts/cases.mjs` and `fixtures/app-medium.mjs`, cases regenerated. Still no paid run.

- Shared plan rubrics (`PLAN_QUALITY`, `REUSE_QUALITY`) no longer demand the plugin-only Goal/Changes/Accept/Checks/Leaves out headings; `five-fields` covers that on the plugin arm. plan-accept is now version 4; plan-reuse stays 1.
- plan-reuse: days overdue and a grand total are optional, the overdue filter may compare dates, new files (tests) are allowed. The regex graders `names-validation` and `extends-reports` are dropped: they pass on a plan that names the validators or `src/reports/` while still writing its own comparison, so only the LLM rubric measures reuse.
- review-subtle: `no-false-defect` narrowed to percentOf / src/legacy not reported broken and no "suite passes" claim; `finding-correct` accepts any affected caller outside the diff; both arms now get the `CITE` sentence; `cites-caller` accepts any `src/(invoices|reports)/*.js:N`.
- investigate-trace: `allowed` gains the 12 supporting files that exist; per-case `limits` override (max_turns 20, timeout 600 s) added to the case shape and merged over `LIMITS`.
- Fixture comments that stated a trap answer were neutralised (code unchanged; npm test still 185 / 181 / 13 failing): the payment-hooks header, "(wired in ./index.js)", the docs/architecture.md money dependency claim, the money.round "Tax and averages" comment, the installments "has no due date" note, the invoices/service "Direct call, unlike payments" comment, the syncStatus "Called by payments" comment, the notifications/index "only place ... app.js calls it" comment, and "Nothing here knows who listens" in both payments services.
- task-multi `test-uses-factory`: calling the payments service directly in the test is allowed; the factory is for seeding.
- Correction: `no-git-mutation` is a shared grader (both arms), not plugin-only.

## Not done

- No paid run: bare scores for the Phase 1 gate (<= 0.7 or doubled cost) are unknown. If bare still scores 1 on a case, harden it before running the plugin.
- Graders that read source use an LLM judge with three votes; there is no executable check of the fix (the harness has none).
- `task-multi` names the test file in the prompt so the test grader can read a literal path.
- Python twin and `--context` flag are Phase 2/3 work.
