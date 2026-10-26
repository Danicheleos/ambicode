// What an earlier /ambicode:plan or /ambicode:investigate leaves in the gitignored .ambicode/tasks/<slug>/ for /ambicode:task to
// pick up: the note file and the ledger line that points at it. A case carries them as `files` named `seed/tasks/<slug>/...`;
// cases.mjs makes its scaffold.sh copy the seed/ folder into .ambicode/.
//
// The ledger line is what src/modules/evidence/notes.ts writes for a note (id and time from appendLocked, then kind, note,
// path, contentHash). task.start reads the latest `plan` note (src/skills/brief.ts briefOf) and search.map(context) the latest
// `investigation` note (investigationOf); task-cases.test.mjs reads these ledgers back through the real ledger reader.
import { contentHash } from '../../src/util/hash.ts';

const AT = '2026-03-01T09:00:00.000Z';
const STAMP = '2026-03-01T09-00';

/** The note's file name below .ambicode/tasks/<slug>/: `plan.md` is the stable name a promoted plan gets, investigations are stamped. */
export const noteFile = (kind) => (kind === 'plan' ? 'plan.md' : `investigation_${STAMP}.md`);

/** `{ 'seed/tasks/<slug>/<note file>': text, 'seed/tasks/<slug>/ledger.jsonl': line }` for one note. */
export function seedFiles(slug, kind, text) {
  const body = `${text.trim()}\n`;
  const entry = { id: 'seedseed-1', at: AT, kind: 'note', note: kind, path: `.ambicode/tasks/${slug}/${noteFile(kind)}`, contentHash: contentHash(body) };
  return {
    [`seed/tasks/${slug}/${noteFile(kind)}`]: body,
    [`seed/tasks/${slug}/ledger.jsonl`]: `${JSON.stringify(entry)}\n`,
  };
}

// ---------------------------------------------------------------- plans (the shape routes/plan/design.md asks for)
export const PLANS = {
  'lb-extend': `
# Limit loan extensions

| requirement | section | code |
| --- | --- | --- |
| a loan can be extended at most MAX_EXTENSIONS times | Iteration 1 | src/contexts/lending/domain/policy.ts:2 |
| the number of extensions a loan has had | Iteration 1 | new: src/contexts/lending/domain/loan.ts Loan.extensions |

## Iteration 1: count extensions and refuse the third

*Goal*: extendLoan refuses once a loan has been extended MAX_EXTENSIONS times, through the existing canExtend rule.

*Changes*:
- src/contexts/lending/domain/loan.ts:9-15 add \`extensions: number\` to Loan; createLoan (src/contexts/lending/domain/loan.ts:24-27) starts it at 0.
- src/contexts/lending/application/extend.ts:8-14 return err(domainError('extension-limit', loanId)) when canExtend (src/contexts/lending/domain/policy.ts:4) is false for loan.extensions; otherwise add LOAN_DAYS to dueOn and increment extensions.
- new: test/extend.test.ts covers the first two extensions and the refused third, which leaves dueOn unchanged.

*Accept*: the third extendLoan call returns an error with code \`extension-limit\`; the first two each add LOAN_DAYS and the stored loan counts them.

*Checks*: unit (test/extend.test.ts).

*Leaves out*: an HTTP route for extending a loan.
`,
  'tw-hours': `
# Reject a forecast window of less than one hour

| requirement | section | code |
| --- | --- | --- |
| a window must ask for at least one hour | Iteration 1 | src/tidewatch/domain/rules/window.py:8-11 |
| a new error with its own TW code | Iteration 1 | new: src/tidewatch/domain/errors.py WindowTooShortError |

## Iteration 1: check_hours refuses 0 and negative hours

*Goal*: forecast_window (src/tidewatch/app/queries/forecast.py:9-11) raises instead of returning an empty window when hours is below 1.

*Changes*:
- src/tidewatch/domain/errors.py:17-18 add \`WindowTooShortError(TidewatchError)\` beside WindowTooLongError.
- src/tidewatch/domain/rules/window.py:8-11 raise WindowTooShortError("TW-311", ...) when hours < 1. TW-311 is free: src/tidewatch/domain/rules/window.py:10 holds TW-310 and no other file uses TW-311 (codes are never reused).
- tests/test_forecast.py:12-14 add \`test_forecast__rejects_window_under_one_hour\` for hours=0 and hours=-3, named by the file's test_<module>__<behaviour> pattern.

*Accept*: forecast_window(..., hours=0) raises WindowTooShortError with code TW-311; hours=1 still returns one height; the handler in src/tidewatch/api/handlers/window.py:9-13 turns it into {"ok": False, "code": "TW-311"} with no change.

*Checks*: unit (tests/test_forecast.py), lint.

*Leaves out*: the start parameter that forecast_window ignores.
`,
  'ph-weight': `
# Refuse a parcel weight of zero or less

| requirement | section | code |
| --- | --- | --- |
| a non-positive weight has no price | Iteration 1 | internal/rates/lookup.go:10-17 |

## Iteration 1: CentsFor rejects grams <= 0

*Goal*: rates.CentsFor returns core.ErrInvalid for 0 and negative weights; today the first band (350 cents) answers them (internal/rates/lookup.go:11-14), and pricing.Quote (internal/pricing/price.go:10-16) passes the weight through unchecked.

*Changes*:
- internal/rates/lookup.go:10-17 return \`fmt.Errorf("rates.CentsFor: %w", core.ErrInvalid)\` first when grams <= 0, the wrapping CONTRIBUTING.md asks for.
- internal/rates/rates_test.go:5-13 add a test beside TestCentsForPicksTheFirstBandThatFits: CentsFor(0) and CentsFor(-5) both satisfy errors.Is(err, core.ErrInvalid).

*Accept*: CentsFor(0) and CentsFor(-5) fail with core.ErrInvalid; CentsFor(1200) is still 620.

*Checks*: go test ./internal/rates.

*Leaves out*: the zone surcharge in internal/pricing/surcharge.go.
`,
  'sv-trays': `
# Refuse a sowing of no trays

| requirement | section | code |
| --- | --- | --- |
| a sowing needs at least one tray | Iteration 1 | application/src/main/kotlin/org/seedvault/application/usecase/germination/SowLotService.kt:25-34 |

## Iteration 1: SowLotService rejects trays < 1

*Goal*: SowLotService returns Outcome.Rejected for a command with zero or negative trays; today such a command marks the lot Sown and publishes LotSown (SowLotService.kt:30-31).

*Changes*:
- application/src/main/kotlin/org/seedvault/application/usecase/germination/SowLotService.kt:25-28 reject \`command.trays < 1\` before the lot is saved, with an Outcome.Rejected reason in the style of the neighbouring ones (SowLotService.kt:26, 29); the lot stays Banked.
- application/src/test/kotlin/org/seedvault/application/usecase/germination/SowLotServiceTest.kt:43-47 add \`rejectsZeroTrays\` next to rejectsUnknownLot, using the same serviceWith helper.

*Accept*: SowLotCommand(lot.id, trays = 0) yields Outcome.Rejected and the repository still holds the lot as Banked.

*Checks*: ./gradlew :application:test.

*Leaves out*: tray capacity (TrayPlanner).
`,
  'kl-minutes': `
# Validate segment minutes in the dashboard

| requirement | section | code |
| --- | --- | --- |
| a segment lasts a positive whole number of minutes | Iteration 1 | dashboard/src/lib/validate/segments.ts:5-8 |

## Iteration 1: checkSegments refuses bad minutes

*Goal*: POST /firings (dashboard/src/routes/firings.routes.ts:4-7) answers 422 for a segment whose minutes is 0, negative or fractional; today only targetDc is checked, so beginFiring (dashboard/src/services/firings.ts:7-13) sends it on to the engine.

*Changes*:
- dashboard/src/lib/validate/segments.ts:5-8 also throw SetpointError (dashboard/src/lib/engine/errors.ts:1, mapped to 422 in dashboard/src/middleware/errors.ts:5) when \`!Number.isInteger(segment.minutes) || segment.minutes < 1\`.
- new: dashboard/test/segments.test.ts covers checkSegments for minutes 0, -5 and 1.5 (each throws) and a valid segment (does not).

*Accept*: checkSegments([{ minutes: 0, targetDc: 5000 }]) throws SetpointError; { minutes: 60, targetDc: 5000 } passes.

*Checks*: dashboard unit (npm test in dashboard/).

*Leaves out*: the Rust engine's own checks; dashboard/src/__generated__ is not edited.
`,
};

// ---------------------------------------------------------------- investigations (a final answer with path:line citations)
export const INVESTIGATIONS = {
  'lb-waiver': `
A late fee is worked out in one place and invoiced in another; the waiver rule exists but nothing calls it.

- returnItem stamps the return and works the fee out: \`lateFee(loan.dueOn, now)\` at src/contexts/lending/application/return.ts:13, then publishes \`lending.loan-returned\` with \`feeCents\` at src/contexts/lending/application/return.ts:14.
- lateFee is 50 cents per day after the due date, never negative: src/contexts/lending/domain/fees/late.ts:6-7.
- Billing reacts to the event by name and issues the invoice when feeCents > 0: src/contexts/billing/application/on-loan-returned.ts:7-8.
- \`waive(fee, reason)\` returns a zero fee when the reason is not blank: src/contexts/lending/domain/fees/waiver.ts:3. A grep for \`waive\` finds no caller, so no return can waive today.
- A waiver therefore belongs between lateFee and the publish in returnItem (return.ts:13-14); billing needs no change because it already skips a zero fee (on-loan-returned.ts:8).
- Tests: test/fees.test.ts covers lateFee only; nothing covers returnItem.
`,
  'tw-start': `
forecast_window takes a start time and never uses it, so a window always starts at the newest reading.

- forecast_window accepts \`start\` at src/tidewatch/app/queries/forecast.py:9 and calls \`build_window(latest_reading(...), hours=hours)\` at src/tidewatch/app/queries/forecast.py:11 without it.
- build_window sets \`start=base.taken_at\` at src/tidewatch/domain/rules/window.py:16, so the Window.start (src/tidewatch/domain/models.py:13-16) is the reading's time whatever the caller asked for.
- The heights are indexed from the reading, \`range(hours)\` at src/tidewatch/domain/rules/window.py:15; only the \`start\` label is wrong, not the heights.
- The only caller is tide_window in src/tidewatch/api/handlers/window.py:9-13, which passes \`start\` through and returns only \`hourly_mm\`, so no reply shows the start today.
- Tests: tests/test_forecast.py:8-14 checks the number of heights and the 49-hour limit; nothing asserts the window's start.
`,
  'ph-advance': `
tracking.Advance accepts any next state for any parcel, including a parcel that is already delivered.

- Advance reads the parcel, appends \`core.Scan{State: next, At: s.clock.Now()}\` and stores it, with no look at the existing scans: internal/tracking/service.go:28-38.
- The helper that answers "already delivered" exists and is unused here: IsDelivered at internal/tracking/history.go:13-16, built on LastState at internal/tracking/history.go:6-11.
- Errors in this package are wrapped with the function name and carry core.ErrInvalid for bad input: internal/tracking/service.go:31 and internal/core/errors.go:6-7.
- Time comes from the injected clock (internal/tracking/service.go:33), and CONTRIBUTING.md forbids time.Now outside internal/clock.
- Tests: internal/tracking/tracking_test.go:13-28 covers the scan time; nothing covers an Advance after Delivered.
`,
  'sv-floor': `
The viability floor is a constant in the domain, and the stock report repeats it as a literal.

- VIABILITY_FLOOR_PERCENT = 50 is defined at domain/src/main/kotlin/org/seedvault/domain/lot/Viability.kt:3 and used by Viability.isViable at Viability.kt:7; GerminationRules uses isViable at domain/src/main/kotlin/org/seedvault/domain/germination/GerminationRules.kt:13.
- viabilityBands in application/src/main/kotlin/org/seedvault/application/usecase/report/ViabilityBands.kt:5-13 splits lots into excellent (>= 90), viable (>= 50) and weak with the literal 50 at ViabilityBands.kt:11, so moving the floor would leave the report behind.
- viabilityBands has no caller yet and no test: StockReportService counts viable lots with isViable (application/src/main/kotlin/org/seedvault/application/usecase/report/StockReportService.kt:10).
- The only existing test in the application module is application/src/test/kotlin/org/seedvault/application/usecase/germination/SowLotServiceTest.kt.
`,
  'kl-zero': `
A schedule may hold a zero-minute segment: it is accepted and then never takes effect.

- Schedule::new checks only that the list is not empty and that each target is within limits: engine/crates/schedule/src/plan.rs:31-39. Segment.minutes is a plain u32 (engine/crates/schedule/src/segment.rs:3).
- target_at_dc adds each segment's minutes and returns the first segment whose end is past the minute (engine/crates/schedule/src/plan.rs:45-52); a segment of 0 minutes adds nothing, so it is skipped, and its setpoint is never reached.
- ramp_dc already treats a zero total as an instant jump (engine/crates/schedule/src/ramp/linear.rs:3-5), a sign the case was considered but not refused.
- ScheduleError has Empty and Unsafe (engine/crates/schedule/src/plan.rs:9-12); a new variant needs a Display arm at plan.rs:14-21.
- check_rate_dc exists (engine/crates/safety/src/limits.rs:17-22) and is not called by Schedule::new; wiring it in would reject the built-in glaze profile (6000 to 12400 dC in 60 minutes), so it is a separate decision.
- Tests: engine/crates/schedule/tests/firing.rs:7-27 covers the hot setpoint and glaze targets; nothing covers a zero-minute segment.
`,
};
