// The /ambicode:investigate cases: ten broad ones (two per stack fixture, on the base fixtures) and five in depth on ts-app-medium (two of them on its ts-app-medium-deep variant). cases.mjs spreads
// `investigateCases`. Every answer below was read off the fixture's own files (fixtures/definitions.mjs); investigate-cases.test.mjs
// checks each `anchors` line is still there and each `absent` claim still holds, so a fixture edit cannot silently turn a truth false.
//
// A case is "tricky" when the plausible answer is wrong: a path that stops short of its end (nothing subscribes, nothing is
// called), a name that looks like the answer (a limit that is never applied, a frozen copy, an unused duplicate) or a question
// whose premise the code does not hold. Graders: the ledger proves the route saved and verified a note; the result is judged by
// facts and citations (shared, so the bare arm is held to the same), by the decoys staying out of `## Files`, and once by a rubric
// where only a sentence can say whether the answer got the point.
import { finalFiles } from './review-cases.mjs';

const CITE = 'Cite `path:line` for each claim.';
const FILES = 'End your answer with a `## Files` section: one path per line, only the files that take part in the answer.';
const REPO = 'The repository is at `repo/`.';
const T = (slug) => `repo/.ambicode/tasks/${slug}/ledger.jsonl`;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const tail = (file) => file.split('/').slice(-2).join('/');

/**
 * question: asked as written in both arms. relevant: files a right answer names; allowed: may be named without hurting; decoys: look
 * right, must not be in `## Files`. cites: files whose `path:line` citation a right answer carries. facts: [name, pattern] a right
 * answer states. verdict: [name, rubric] for the one point only a sentence can judge. anchors: [file, text] that must stay in the
 * fixture. absent: {find, in?, except?} that must stay false across the fixture (the "nothing calls it" claims).
 * files: false for a question with no files list (the answer is that nothing is there); its metric then scores the citations.
 */
export const INVESTIGATE_TRUTHS = [
  {
    name: 'investigate-ts-extend-late-fee', slug: 'inv-extend', fixture: 'ts-service-lendbox',
    description: 'Work out a late fee from a loan that was extended, across the lending and billing contexts of a bounded-context service.',
    question: 'A tool is borrowed on 2026-03-02 and its loan is extended three times with the extend use case, then the tool is returned on 2026-04-01. What late fee does the code work out for that return, from which due date, and what happens to the fee afterwards?',
    relevant: ['src/contexts/lending/application/extend.ts', 'src/contexts/lending/domain/policy.ts', 'src/contexts/lending/domain/loan.ts', 'src/contexts/lending/application/return.ts', 'src/contexts/lending/domain/fees/late.ts', 'src/composition.ts'],
    allowed: ['src/shared-kernel/time/calendar.ts', 'src/shared-kernel/time/period.ts', 'src/shared-kernel/events/bus.ts', 'src/shared-kernel/events/event.ts', 'src/shared-kernel/money/money.ts', 'src/contexts/lending/application/borrow.ts', 'src/contexts/lending/application/deps.ts', 'src/contexts/lending/index.ts', 'src/contexts/lending/http/routes.ts', 'src/contexts/billing/application/on-loan-returned.ts', 'src/contexts/billing/application/issue-invoice.ts', 'test/fees.test.ts'],
    decoys: ['src/contexts/lending/domain/fees/waiver.ts', 'src/contexts/lending/domain/fees/damage.ts'],
    cites: ['src/contexts/lending/application/extend.ts', 'src/contexts/lending/domain/fees/late.ts'],
    facts: [['fee-100-cents', '\\b100\\b']],
    verdict: ['uncapped-extensions-fee', `
PASS if the answer states, in any wording, all three:
- The fee is 100 cents: two days late at 50 cents a day, counted from the due date after the three extensions (2026-03-30), not from the original due date (2026-03-09).
- All three extensions take effect: the limit of two extensions (MAX_EXTENSIONS and canExtend in src/contexts/lending/domain/policy.ts) is never checked by the extend use case.
- The fee leaves lending only as feeCents in the payload of the lending.loan-returned event; nothing subscribes billing to it (src/composition.ts wires no subscriber), so no invoice follows.
Equivalent wording counts ("the cap is not applied", "nothing consumes the event"). Naming onLoanReturned or issueInvoice as the code that would invoice is fine.
FAIL if it gives another fee (for example 450 cents from a cap of two extensions, or 350 from the original due date), says the extension limit is enforced, or says the member is invoiced.`],
    anchors: [['src/contexts/lending/application/extend.ts', 'addDays(loan.dueOn, LOAN_DAYS)'], ['src/contexts/lending/domain/policy.ts', 'MAX_EXTENSIONS = 2'], ['src/contexts/lending/domain/fees/late.ts', 'CENTS_PER_LATE_DAY = 50'], ['src/contexts/lending/application/return.ts', 'lateFee(loan.dueOn, now)'], ['src/shared-kernel/time/period.ts', 'Math.floor']],
    absent: [{ find: 'canExtend', except: ['src/contexts/lending/domain/policy.ts'] }, { find: 'MAX_EXTENSIONS', except: ['src/contexts/lending/domain/policy.ts'] }, { find: 'extendLoan', except: ['src/contexts/lending/application/extend.ts'] }, { find: 'waive(', except: ['src/contexts/lending/domain/fees/waiver.ts'] }, { find: 'damageFee', except: ['src/contexts/lending/domain/fees/damage.ts'] }, { find: '.subscribe(' }, { find: 'billing', in: 'src/composition.ts' }],
  },
  {
    name: 'investigate-ts-loan-limit', slug: 'inv-limit', fixture: 'ts-service-lendbox',
    description: 'Find where a per-member limit is applied on a bounded-context service.',
    question: 'Where is the limit on how many tools a member may have on loan at once enforced when a loan is started?',
    relevant: ['src/contexts/members/domain/tier.ts', 'src/contexts/lending/application/borrow.ts'],
    allowed: ['src/composition.ts', 'src/contexts/lending/domain/loan.ts', 'src/contexts/lending/application/deps.ts', 'src/contexts/members/domain/standing.ts', 'src/contexts/catalog/index.ts', 'test/borrow.test.ts'],
    decoys: ['src/contexts/lending/domain/policy.ts'],
    cites: ['src/contexts/members/domain/tier.ts', 'src/contexts/lending/application/borrow.ts'],
    facts: [],
    verdict: ['limit-is-not-applied', `
PASS if the answer states, in any wording, that nothing enforces the per-member loan limit when a loan is started: loanLimit (3 for basic, 5 for plus, in src/contexts/members/domain/tier.ts) is defined, but no code calls it; borrowItem does not check it and no route does. "It is not enforced", "defined but never applied", "no check exists" all count. Naming borrowItem as the place where a check would have to go is fine.
FAIL if it names borrowItem, a route or any other code as enforcing the limit, or invents a check.`],
    anchors: [['src/contexts/members/domain/tier.ts', "tier === 'plus' ? 5 : 3"], ['src/contexts/lending/application/borrow.ts', 'isLendable(itemId)'], ['src/composition.ts', 'isLendable: async () => true']],
    absent: [{ find: 'loanLimit', except: ['src/contexts/members/domain/tier.ts'] }, { find: 'canBorrow', except: ['src/contexts/members/domain/standing.ts'] }],
  },
  {
    name: 'investigate-py-calibrate-ties', slug: 'inv-calib', fixture: 'py-service-tidewatch',
    description: 'Follow a correction applied to stored readings through the store and the query that reads them back, in a layered service.',
    question: 'The only reading of the gauge dover, taken a minute ago, is 1000 mm. Then `calibrate(services, "dover", offset_mm=20)` runs. What level does `current_level` report for dover afterwards, and why?',
    relevant: ['src/tidewatch/app/commands/calibrate.py', 'src/tidewatch/infra/store/memory.py', 'src/tidewatch/app/queries/latest.py', 'src/tidewatch/api/handlers/level.py'],
    allowed: ['src/tidewatch/app/ports/store.py', 'src/tidewatch/domain/models.py', 'src/tidewatch/domain/rules/staleness.py', 'src/tidewatch/domain/rules/limits.py', 'src/tidewatch/domain/events/readings.py', 'src/tidewatch/domain/events/bus.py', 'src/tidewatch/domain/errors.py', 'src/tidewatch/api/replies.py', 'src/tidewatch/app/services.py', 'src/tidewatch/infra/wiring.py', 'tests/test_handlers.py', 'tests/conftest.py'],
    decoys: ['src/tidewatch/infra/store/journal.py'],
    cites: ['src/tidewatch/app/commands/calibrate.py', 'src/tidewatch/app/queries/latest.py'],
    facts: [],
    verdict: ['level-unchanged-by-calibration', `
PASS if the answer states, in any wording, that current_level still reports 1000 mm, the uncorrected value, and why: calibrate adds a corrected copy of each reading to the store (store.add appends, it does not replace the old one) with the same taken_at, and latest_reading takes the newest by taken_at, where max() keeps the first of equal keys, which is the original. "The calibrated 1020 never wins the tie" or "the old row is returned first" count.
FAIL if it says the level becomes 1020 (or any calibrated value), or says the call fails (unknown gauge, stale reading, window), or explains 1000 by something other than the equal timestamps.`],
    anchors: [['src/tidewatch/app/commands/calibrate.py', 'replace(reading, level_mm=reading.level_mm + offset_mm)'], ['src/tidewatch/infra/store/memory.py', 'rows.append(reading)'], ['src/tidewatch/app/queries/latest.py', 'max(readings, key=lambda item: item.taken_at)'], ['src/tidewatch/api/handlers/level.py', 'level_mm=reading.level_mm'], ['src/tidewatch/infra/store/journal.py', 'self.journal.append(reading)']],
    absent: [{ find: 'JournalStore(', except: ['src/tidewatch/infra/store/journal.py'] }, { find: 'GaugeCalibrated', except: ['src/tidewatch/domain/events/readings.py', 'src/tidewatch/app/commands/calibrate.py'] }, { find: '.subscribe(' }],
  },
  {
    name: 'investigate-py-unit-adapters', slug: 'inv-units', fixture: 'py-service-tidewatch',
    description: 'Pick the odd ones out among twelve near-identical feed adapters.',
    question: 'Which of the gauge feed adapters do not report water levels in millimetres, and how does each of them convert to millimetres?',
    relevant: ['src/tidewatch/plugins/sources/weir_levels/parse.py', 'src/tidewatch/plugins/sources/jetty_text/parse.py', 'src/tidewatch/domain/units/length.py'],
    allowed: ['src/tidewatch/plugins/sources/weir_levels/plugin.py', 'src/tidewatch/plugins/sources/jetty_text/plugin.py', 'src/tidewatch/plugins/sources/__init__.py', 'src/tidewatch/plugins/registry.py'],
    decoys: ['src/tidewatch/domain/units/pressure.py'],
    cites: ['src/tidewatch/plugins/sources/weir_levels/parse.py', 'src/tidewatch/plugins/sources/jetty_text/parse.py'],
    facts: [['weir-centimetres', 'centimet|\\bcm\\b'], ['jetty-metres', '\\bmetres?\\b|\\bmeters?\\b']],
    verdict: null,
    anchors: [['src/tidewatch/plugins/sources/weir_levels/parse.py', 'int(centimetres) * 10'], ['src/tidewatch/plugins/sources/jetty_text/parse.py', 'mm_from_m(metres)'], ['src/tidewatch/domain/units/pressure.py', 'def mm_head_from_hpa']],
    absent: [{ find: 'mm_head_from_hpa', except: ['src/tidewatch/domain/units/pressure.py'] }, { find: 'mm_from_m', except: ['src/tidewatch/domain/units/length.py', 'src/tidewatch/plugins/sources/jetty_text/parse.py'] }],
  },
  {
    name: 'investigate-go-label-bay', slug: 'inv-bay', fixture: 'go-module-parcelhub',
    description: 'Trace every value printed by a command line tool back to where it comes from, across small packages.',
    question: 'What does `parcelctl PH-7 1200 north` print, and where does each value on its two lines come from?',
    relevant: ['cmd/parcelctl/main.go', 'cmd/parcelctl/flags.go', 'cmd/parcelctl/print.go', 'internal/labels/label.go', 'internal/pricing/price.go', 'internal/pricing/surcharge.go', 'internal/rates/table.go'],
    allowed: ['internal/rates/lookup.go', 'internal/core/types.go', 'internal/core/errors.go', 'internal/memstore/store.go', 'internal/memstore/seed.go', 'internal/rates/rates_test.go'],
    decoys: ['internal/depot/bays.go', 'internal/depot/planner.go', 'internal/routing/zones.go', 'internal/labels/barcode.go'],
    cites: ['cmd/parcelctl/main.go', 'internal/labels/label.go'],
    facts: [['price-7-40', '7\\.40|\\b740\\b']],
    verdict: ['bay-is-zero', `
PASS if the answer states, in any wording, all three:
- The first line is "PH-7 | zone north | 1200g | bay 0": the bay is 0 because parcelctl builds the Parcel from its arguments only and nothing assigns a bay (the depot's BayFor and Planner are not called by parcelctl).
- The zone printed is the argument as typed ("north"); the routing package is not used to derive it.
- The second line is price 7.40: 620 cents for the band up to 2000 g plus the 120 cent surcharge for a zone other than hub.
FAIL if it says the bay is a number from 1 to 12 worked out by the depot, says the zone is derived from a postcode by routing, or gives a price other than 7.40.`],
    anchors: [['cmd/parcelctl/main.go', 'core.Parcel{Tag: opts.tag, Grams: opts.grams, Zone: opts.zone}'], ['internal/labels/label.go', 'bay %d'], ['internal/depot/bays.go', 'func BayFor'], ['internal/routing/zones.go', 'func ZoneFor'], ['internal/rates/table.go', '{UpToGrams: 2000, Cents: 620}'], ['internal/pricing/surcharge.go', 'return 120']],
    absent: [{ find: 'internal/depot"' }, { find: 'internal/routing"' }, { find: 'ZoneFor(', except: ['internal/routing/zones.go'] }, { find: 'Barcode(', except: ['internal/labels/barcode.go'] }],
  },
  {
    name: 'investigate-go-parceld-lookup', slug: 'inv-lookup', fixture: 'go-module-parcelhub',
    description: 'Follow a parcel from one binary of a repository to another through the store both use.',
    question: 'After `parcelctl PH-7 1200 north` has run, what does a request `GET /parcels/PH-7` to a running parceld answer, and why?',
    relevant: ['cmd/parceld/routes.go', 'cmd/parcelctl/main.go', 'internal/memstore/store.go', 'internal/httpapi/parcels.go', 'internal/tracking/service.go', 'internal/httpapi/render/problem.go'],
    allowed: ['internal/memstore/seed.go', 'internal/httpapi/server.go', 'internal/core/errors.go', 'internal/core/interfaces.go', 'cmd/parceld/main.go', 'internal/httpapi/server_test.go'],
    decoys: ['internal/audit/log.go', 'internal/retention/policy.go', 'internal/tagging/check.go'],
    cites: ['cmd/parceld/routes.go', 'internal/httpapi/parcels.go'],
    facts: [['status-404', '404']],
    verdict: ['separate-empty-store', `
PASS if the answer states, in any wording, that parceld answers 404 "no such parcel", because parceld builds its own in-memory store (memstore.New in buildHandler), nothing seeds it and no route writes to it, while the parcel parcelctl seeded lived in the store of another process that has already exited: no store is shared or persisted between the two.
FAIL if it says the request returns the parcel (200), says parcelctl and parceld share a store, or explains the 404 by tag validation, retention or expiry.`],
    anchors: [['cmd/parceld/routes.go', 'store := memstore.New()'], ['cmd/parcelctl/main.go', 'store := memstore.New()'], ['internal/httpapi/parcels.go', 'render.Problem(w, http.StatusNotFound, "no such parcel")'], ['internal/memstore/store.go', 'memstore.Get: %w'], ['internal/retention/policy.go', 'func Expired']],
    absent: [{ find: 'Seed(', in: 'cmd/parceld/' }, { find: '.Put(', in: 'internal/httpapi/' }, { find: 'internal/retention"' }, { find: 'tagging.Valid', except: ['internal/tagging/check.go'] }],
  },
  {
    name: 'investigate-jvm-sow-mail', slug: 'inv-sow', fixture: 'jvm-gradle-seedvault',
    description: 'Follow an event from a use case to the message it produces in a hexagonal project.',
    question: 'When a seed lot is sown, who is notified, and by what path does that message get there?',
    relevant: ['application/src/main/kotlin/org/seedvault/application/usecase/germination/SowLotService.kt', 'adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/bus/InProcessEventBus.kt', 'bootstrap/src/main/kotlin/org/seedvault/bootstrap/Wiring.kt', 'adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/mail/SowingMail.kt', 'adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/mail/Recipients.kt'],
    allowed: ['adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/bus/Subscriptions.kt', 'adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/bus/Topic.kt', 'adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/mail/Templates.kt', 'domain/src/main/kotlin/org/seedvault/domain/events/GerminationEvents.kt', 'application/src/main/kotlin/org/seedvault/application/port/output/EventPublisher.kt', 'bootstrap/src/main/kotlin/org/seedvault/bootstrap/Main.kt'],
    decoys: ['adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/outbox/Outbox.kt', 'adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/outbox/Drainer.kt', 'adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/outbox/OutboxEntry.kt'],
    cites: ['bootstrap/src/main/kotlin/org/seedvault/bootstrap/Wiring.kt', 'adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/mail/Recipients.kt'],
    facts: [['fallback-desk', 'desk@example\\.org']],
    verdict: ['printed-not-mailed', `
PASS if the answer states, in any wording, all three:
- The sowing message is built by the handler that Wiring.kt subscribes to the "lot.sown" topic of the in-process bus (SowLotService publishes LotSown).
- It is addressed to the fallback desk@example.org, because the recipients map is empty.
- It is only printed to the console: no mail is sent.
Saying the outbox classes are not on this path, or that they were not read or not confirmed, is fine.
FAIL if it routes the message through the outbox or the Drainer, says a real mail is sent, or names another recipient.`],
    anchors: [['bootstrap/src/main/kotlin/org/seedvault/bootstrap/Wiring.kt', 'subscriptions.add("lot.sown")'], ['bootstrap/src/main/kotlin/org/seedvault/bootstrap/Wiring.kt', 'Recipients(emptyMap(), "desk@example.org")'], ['application/src/main/kotlin/org/seedvault/application/usecase/germination/SowLotService.kt', 'events.publish(LotSown(']],
    absent: [{ find: 'Outbox()' }, { find: 'Drainer(', except: ['adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/outbox/Drainer.kt'] }],
  },
  {
    name: 'investigate-jvm-viability-rule', slug: 'inv-viab', fixture: 'jvm-gradle-seedvault',
    description: 'Find the rule behind a word used in several places of a hexagonal project.',
    question: 'Which code decides that a seed lot is viable, and where is that decision applied?',
    relevant: ['domain/src/main/kotlin/org/seedvault/domain/lot/Viability.kt', 'domain/src/main/kotlin/org/seedvault/domain/germination/GerminationRules.kt', 'application/src/main/kotlin/org/seedvault/application/usecase/report/StockReportService.kt'],
    allowed: ['application/src/main/kotlin/org/seedvault/application/usecase/germination/SowLotService.kt', 'adapters/rest/src/main/kotlin/org/seedvault/adapters/rest/routes/ReportRoutes.kt', 'adapters/cli/src/main/kotlin/org/seedvault/adapters/cli/commands/ReportCommand.kt', 'application/src/main/kotlin/org/seedvault/application/port/input/ReportStock.kt', 'domain/src/main/kotlin/org/seedvault/domain/lot/SeedLot.kt', 'domain/src/main/kotlin/org/seedvault/domain/shared/Outcome.kt'],
    decoys: ['application/src/main/kotlin/org/seedvault/application/usecase/report/ViabilityBands.kt'],
    cites: ['domain/src/main/kotlin/org/seedvault/domain/lot/Viability.kt', 'application/src/main/kotlin/org/seedvault/application/usecase/report/StockReportService.kt'],
    facts: [['floor-50', '\\b50\\b']],
    verdict: null,
    anchors: [['domain/src/main/kotlin/org/seedvault/domain/lot/Viability.kt', 'VIABILITY_FLOOR_PERCENT = 50'], ['domain/src/main/kotlin/org/seedvault/domain/germination/GerminationRules.kt', 'lot.viability.isViable()'], ['application/src/main/kotlin/org/seedvault/application/usecase/report/StockReportService.kt', 'it.viability.isViable()']],
    absent: [{ find: 'viabilityBands(', except: ['application/src/main/kotlin/org/seedvault/application/usecase/report/ViabilityBands.kt'] }],
  },
  {
    name: 'investigate-mono-max-setpoint', slug: 'inv-setpt', fixture: 'monorepo-rust-ts-kiln',
    description: 'Trace one limit across the projects of a monorepo.',
    question: 'Where is the maximum setpoint temperature enforced, and is it enforced in each of the three projects?',
    relevant: ['engine/crates/safety/src/limits.rs', 'engine/crates/schedule/src/plan.rs', 'dashboard/src/lib/validate/limits.ts', 'dashboard/src/lib/validate/setpoint.ts', 'dashboard/src/lib/validate/segments.ts'],
    allowed: ['dashboard/src/services/firings.ts', 'engine/crates/safety/src/error.rs', 'dashboard/src/lib/engine/client.ts', 'dashboard/src/lib/engine/errors.ts', 'dashboard/src/middleware/errors.ts', 'dashboard/src/services/alerts/rules.ts', 'dashboard/test/setpoint.test.ts', 'engine/crates/schedule/tests/firing.rs'],
    decoys: ['tools/src/kilnlab/config/limits.py'],
    cites: ['engine/crates/safety/src/limits.rs', 'dashboard/src/lib/validate/limits.ts'],
    facts: [['limit-13000', '13[_,]?000']],
    verdict: ['two-copies-no-tools', `
PASS if the answer states, in any wording, all three:
- The engine enforces the setpoint limit of 13_000 tenths of a degree (safety limits, applied when a Schedule is built).
- The dashboard enforces it separately, with its own copy of the constant that it does not import from the engine, applied to the segments of a new firing.
- The Python tools enforce no setpoint limit (their only limit is a calibration offset).
Extra detail (alert rules, tests, paths it did not trace) is fine.
FAIL if it says the tools enforce the setpoint limit, that the dashboard takes the constant from the engine, or that the limit is enforced in only one project.`],
    anchors: [['engine/crates/safety/src/limits.rs', 'MAX_SETPOINT_DC: i32 = 13_000'], ['engine/crates/schedule/src/plan.rs', 'check_setpoint_dc(segment.target_dc)'], ['dashboard/src/lib/validate/limits.ts', 'MAX_SETPOINT_DC = 13_000'], ['dashboard/src/services/firings.ts', 'checkSegments(segments)'], ['tools/src/kilnlab/config/limits.py', 'MAX_OFFSET_DC = 200']],
    absent: [{ find: 'SETPOINT', in: 'tools/' }],
  },
  {
    name: 'investigate-mono-over-limit-post', slug: 'inv-post', fixture: 'monorepo-rust-ts-kiln',
    description: 'Follow a rejected request through the validation, the route and the error handling of a web service that sits in front of another project.',
    question: 'A POST /firings reaches the dashboard with a segment whose targetDc is 13500. What response does the client get, which code produces it, and does the request ever reach the engine?',
    relevant: ['dashboard/src/routes/firings.routes.ts', 'dashboard/src/services/firings.ts', 'dashboard/src/lib/validate/segments.ts', 'dashboard/src/lib/validate/setpoint.ts', 'dashboard/src/lib/validate/limits.ts', 'dashboard/src/middleware/errors.ts', 'dashboard/src/lib/engine/errors.ts', 'dashboard/package.json'],
    allowed: ['dashboard/src/app.ts', 'dashboard/src/server.ts', 'dashboard/src/middleware/auth.ts', 'dashboard/src/services/store.ts', 'dashboard/src/lib/engine/types.ts', 'dashboard/test/setpoint.test.ts', 'dashboard/test/routes.test.ts'],
    decoys: ['engine/crates/safety/src/limits.rs', 'engine/crates/schedule/src/plan.rs', 'dashboard/src/lib/engine/client.ts', 'dashboard/src/services/alerts/rules.ts'],
    cites: ['dashboard/src/services/firings.ts', 'dashboard/src/lib/validate/segments.ts'],
    facts: [['names-the-limit', '13[_,]?000|outside the kiln limits']],
    verdict: ['rejected-before-engine-no-response', `
PASS if the answer states, in any wording, all three:
- The dashboard rejects the segment itself: checkSegments (isSetpointDc, limit 13_000 in dashboard/src/lib/validate/limits.ts) throws a SetpointError "setpoint 13500 is outside the kiln limits" inside beginFiring, before startFiring, so the engine is never called.
- handleErrors would map a SetpointError to a 422 JSON reply, but the route is an async handler on Express 4 (dashboard/package.json), which does not pass a rejected promise to the error middleware.
- So the client does not get that 422: the request gets no response (it hangs) and the rejection is unhandled.
Equivalent wording counts ("express 4 does not catch async errors", "the error never reaches handleErrors"). Mentioning that the engine has its own copy of the check is fine.
FAIL if it says the engine rejects the segment, says the client receives the 422 JSON reply (or any other response) from handleErrors, or says the request reaches the engine.`],
    anchors: [['dashboard/src/services/firings.ts', 'checkSegments(segments);'], ['dashboard/src/services/firings.ts', 'await startFiring(id, segments);'], ['dashboard/src/lib/validate/segments.ts', 'is outside the kiln limits'], ['dashboard/src/lib/validate/limits.ts', 'MAX_SETPOINT_DC = 13_000'], ['dashboard/src/middleware/errors.ts', 'error instanceof SetpointError'], ['dashboard/src/routes/firings.routes.ts', "app.post('/firings', async (req, res)"], ['dashboard/package.json', '"express": "^4.21.0"'], ['dashboard/src/app.ts', 'app.use(handleErrors)']],
    absent: [{ find: 'express-async-errors' }, { find: 'asyncHandler' }, { find: 'catch (', in: 'dashboard/src/' }, { find: 'try {', in: 'dashboard/src/' }, { find: 'startFiring', except: ['dashboard/src/services/firings.ts', 'dashboard/src/lib/engine/client.ts'] }],
  },
  // ---------------------------------------------------------------- ts-app-medium, in depth
  {
    name: 'investigate-app-mail-paths', slug: 'inv-mail', fixture: 'ts-app-medium',
    description: 'Compare how two mails of one service reach the customer.',
    question: 'A customer gets a mail when an invoice is created and another when a payment is received. For each of the two, which code path sends it, and does it go through the event bus?',
    relevant: ['src/invoices/service.js', 'src/payments/service.js', 'src/notifications/index.js', 'src/notifications/handlers.js', 'src/notifications/service.js', 'src/app.js'],
    allowed: ['src/notifications/channels.js', 'src/notifications/templates.js', 'src/shared/events/bus.js', 'src/shared/events/topics.js', 'src/customers/service.js', 'src/flags.js', 'src/payments/routes.js', 'src/invoices/routes.js', 'src/notifications/repository.js', 'src/notifications/model.js', 'tests/notifications/flow.test.js', 'docs/architecture.md'],
    decoys: ['src/legacy/payment-hooks.js', 'src/notifications/queue.js'],
    cites: ['src/notifications/handlers.js', 'src/invoices/service.js'],
    facts: [['names-direct-call', 'sendInvoiceCreated']],
    verdict: ['bus-or-direct', `
PASS if the answer conveys both points, in any wording:
- The payment receipt goes over the event bus: payments emits payment.received, notifications register (called from createApp) subscribes onPaymentReceived to it, and that handler delivers the mail.
- The invoice-created mail does not go over the bus: the invoices service calls the notifications service's sendInvoiceCreated directly. The invoice.created event is emitted, but no subscriber sends mail for it.
Naming the files or functions differently, or describing the flow in prose, is fine as long as each of the two mails is placed on the right path.
FAIL if it says a subscriber sends the invoice-created mail, says the receipt is sent by a direct call, or presents src/legacy code as part of either path.`],
    anchors: [['src/invoices/service.js', 'notifications.sendInvoiceCreated(invoice'], ['src/invoices/service.js', 'bus.emit(TOPICS.INVOICE_CREATED'], ['src/payments/service.js', 'bus.emit(TOPICS.PAYMENT_RECEIVED'], ['src/notifications/index.js', 'eventBus.on(TOPICS.PAYMENT_RECEIVED'], ['src/app.js', 'notifications.register(eventBus)']],
    absent: [{ find: 'on(TOPICS.INVOICE_CREATED', in: 'src/' }, { find: "on('invoice.created'", in: 'src/' }, { find: 'notifyPaymentLegacy', except: ['src/legacy/payment-hooks.js'] }],
  },
  {
    name: 'investigate-app-total-legacy', slug: 'inv-total', fixture: 'ts-app-medium',
    description: 'A total that the repository computes in more than one place.',
    question: 'How is the total of an invoice worked out, tax and rounding included, and which code does it?',
    relevant: ['src/invoices/service.js', 'src/invoices/lines.js'],
    allowed: ['src/shared/money.js', 'src/invoices/routes.js', 'src/invoices/model.js', 'src/invoices/summary.js', 'tests/invoices/service.test.js', 'tests/invoices/lines.test.js'],
    decoys: ['src/legacy/invoice-total.js', 'src/legacy/invoice-export.js', 'src/reports/service.js', 'src/reports/csv.js'],
    cites: ['src/invoices/service.js', 'src/invoices/lines.js'],
    facts: [['tax-in-basis-points', 'taxBps']],
    verdict: ['current-total-not-legacy', `
PASS if the answer states, in any wording, that the live total is the sum over the lines of quantity times unitCents (integer cents) plus tax, where tax is the subtotal times taxBps divided by 10000 rounded to a whole cent (half up), computed in src/invoices/service.js. The floating-point legacy total may be mentioned as a separate, unused copy.
FAIL if it describes the legacy total as the one the application uses, or leaves tax out.`],
    anchors: [['src/invoices/service.js', 'return subtotal(invoice.lines) + taxFor(invoice);'], ['src/invoices/service.js', 'money.round((subtotal(invoice.lines) * invoice.taxBps) / 10000)'], ['src/invoices/lines.js', 'line.quantity * line.unitCents'], ['src/legacy/invoice-total.js', 'unitCents / 100']],
    absent: [{ find: 'legacy/invoice-total', in: 'src/app.js' }, { find: "require('./invoice-total')", except: ['src/legacy/invoice-export.js'] }],
  },
  {
    name: 'investigate-app-overdue-reminders', slug: 'inv-remind', fixture: 'ts-app-medium',
    description: 'A question about behaviour the repository may not have.',
    question: 'How does the app remind customers about overdue invoices: which job sends the reminder, and after how many days?',
    files: false,
    relevant: ['src/flags.js'],
    allowed: ['src/reports/aging.js', 'src/reports/service.js', 'src/reports/routes.js', 'src/config.js', 'src/notifications/queue.js', 'src/notifications/handlers.js', 'tests/flags.test.js', 'tests/reports/aging.test.js'],
    decoys: [],
    cites: ['src/flags.js'],
    facts: [['finds-the-flag', 'overdueReminders']],
    verdict: ['nothing-sends-reminders', `
PASS if the answer states, in any wording, that this repository has no overdue-reminder job or sender: no code mails customers about overdue invoices and no scheduler triggers one (the overdueReminders flag in src/flags.js exists, is off by default and is read by no code). "There is no reminder job", "the feature does not exist", "nothing sends overdue reminders" all count. Mentioning the flag, the aging report or the queue's "scheduled job" comment as nearby things is fine, as are statements about what was not searched.
FAIL if it names a file or function as what sends overdue reminders, states a number of days after which a reminder goes out (the aging buckets are not a reminder schedule), or describes a reminder feature as existing, or answers from general knowledge instead of this repository's code.`],
    anchors: [['src/flags.js', 'overdueReminders: false'], ['src/config.js', 'agingBucketsDays: [30, 60]'], ['src/notifications/queue.js', 'e.g. from a scheduled job']],
    absent: [{ find: 'overdueReminders', except: ['src/flags.js'] }, { find: 'setInterval' }, { find: 'cron' }],
  },
  {
    name: 'investigate-app-optout-files-2', slug: 'inv-optout2', fixture: 'ts-app-medium-deep',
    description: 'Which files a change to an existing feature would edit, when the request body passes through a layer the obvious file does not show.',
    question: 'Which files would change to let a customer choose which channel gets their payment receipts (email, sms or both) after the account exists, through PATCH /customers/:customerId with { "receiptChannels": ["sms"] }?',
    filesRule: 'End your answer with a `## Files` section: one path per line, only the files the change edits.',
    relevant: ['src/customers/patch.js', 'src/customers/service.js', 'src/notifications/handlers.js', 'tests/customers/service.test.js'],
    allowed: ['src/customers/model.js', 'src/customers/routes.js', 'tests/customers/routes.test.js', 'tests/notifications/handlers.test.js'],
    decoys: ['src/flags.js', 'src/legacy/payment-hooks.js', 'src/notifications/service.js', 'src/customers/repository.js'],
    cites: ['src/customers/patch.js', 'src/notifications/handlers.js'],
    facts: [['lists-a-test', 'tests/customers/(service|routes)\\.test\\.js']],
    verdict: null,
    anchors: [['src/customers/patch.js', 'phone: (value) => value,'], ['src/customers/service.js', 'const next = patchable.pick(patch);'], ['src/customers/routes.js', 'service.update(req.params.customerId, req.body)'], ['src/notifications/handlers.js', 'if (!contact.receipts) return null;'], ['src/notifications/handlers.js', "flags.isEnabled('smsReceipts') && contact.phone"], ['src/customers/service.js', 'function contactFor']],
    absent: [{ find: 'receipt', in: 'src/customers/patch.js' }, { find: 'receiptChannels' }, { find: 'patchable', except: ['src/customers/service.js'] }, { find: 'patch.js', in: 'src/customers/routes.js' }],
  },
  {
    name: 'investigate-app-segment-flow-2', slug: 'inv-segment2', fixture: 'ts-app-medium-deep',
    description: 'A figure that changes with no new data: the cause is two modules and a setting away from the symptom.',
    question: 'A customer was gold last year and is silver today. What made their segment change, and what would put them back to gold?',
    relevant: ['src/customers/segments.js', 'src/customers/window.js', 'src/config.js', 'src/invoices/repository.js'],
    allowed: ['src/invoices/service.js', 'src/invoices/lines.js', 'src/shared/clock.js', 'src/shared/money.js', 'tests/customers/segments.test.js'],
    decoys: ['src/reports/aging.js', 'src/reports/top-customers.js', 'src/legacy/invoice-total.js'],
    cites: ['src/customers/segments.js', 'src/customers/window.js'],
    facts: [['gold-threshold', '500[_,]?000'], ['window-365', '365']],
    verdict: ['window-ages-out', `
PASS if the answer states, in any wording, that the segment is computed only from invoices issued inside a rolling time window (365 days, set by segmentWindowDays in src/config.js), so older invoices stop counting as time passes and the customer's billed amount fell below the gold threshold of 500000 cents; and that returning to gold takes enough invoices inside the window to reach 500000 cents (tax included in each invoice total).
FAIL if it says the segment is an all-time or lifetime sum with no window, explains the change by voiding, refunds or payments, or does not identify a time window as the cause.`],
    anchors: [['src/customers/segments.js', 'invoices.list({ customerId, since: window.startOfWindow() })'], ['src/customers/window.js', 'start.setUTCDate(start.getUTCDate() - config.segmentWindowDays)'], ['src/config.js', 'segmentWindowDays: 365'], ['src/invoices/repository.js', 'invoice.issuedAt >= since'], ['src/customers/segments.js', 'gold: 500000, silver: 100000']],
    absent: [{ find: 'startOfWindow', except: ['src/customers/segments.js', 'src/customers/window.js'] }, { find: 'segmentWindowDays', except: ['src/config.js', 'src/customers/window.js'] }, { find: 'customers/window', in: 'src/reports/' }],
  },
];

/** Every `absent` claim as a list of the files that break it. */
export function violations(truth, files) {
  const broken = [];
  for (const { find, in: prefix, except = [] } of truth.absent) {
    for (const [file, text] of files) {
      if (prefix !== undefined && !file.startsWith(prefix)) continue;
      if (except.includes(file) || !text.includes(find)) continue;
      broken.push(`${find} in ${file}`);
    }
  }
  return broken;
}

// A decoy fails only as an entry of a Files list: a line inside the `## Files…` section (any heading suffix) that opens, after an
// optional bullet, number, backtick or `repo/`, with the decoy path. The old `## Files[\s\S]*decoy` also failed an answer whose
// heading was "## Files that change" and that explained a ruled-out file in the prose below it (optout-files-2, 2026-10-23).
export const decoyPattern = (decoys) =>
  `(?:^|\\n)#{1,6}[ \\t]*Files\\b[^\\n]*(?:\\n(?!#{1,6}[ \\t])[^\\n]*)*?\\n[ \\t]*(?:[-*]|\\d+[.)])?[ \\t]*[\`*]*(?:repo/)?(?:${decoys.map(escape).join('|')})(?![\\w/-])`;
export const citePattern = (file) => `${escape(tail(file))}:\\d+`;

export function investigateCases(b) {
  const { regex, ledger, llm, shared, noEdits, DONE } = b;
  return INVESTIGATE_TRUTHS.map((t) => {
    const filesRule = t.files === false ? '' : ` ${t.filesRule ?? FILES}`;
    const ask = `${t.question} ${CITE}${filesRule} ${REPO}`;
    const graders = [
      ledger('note-saved', '"kind":"note","note":"investigation"', T(t.slug)),
      ledger('citations-valid', '"worker":"check-citations"[^\\n]*"failed":false', T(t.slug)),
      DONE(T(t.slug)),
      ...t.cites.map((file) => shared(regex(`cites-${tail(file).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`, citePattern(file)))),
      ...t.facts.map(([name, pattern]) => shared(regex(name, pattern))),
      ...(t.decoys.length === 0 || t.files === false ? [] : [shared(regex('files-skip-decoys', decoyPattern(t.decoys), { match: 'not_contains' }))]),
      ...(t.verdict === null ? [] : [shared(llm(t.verdict[0], t.verdict[1]))]),
      ...noEdits,
    ];
    return {
      name: t.name,
      description: t.description,
      tags: ['investigate', t.fixture.startsWith('ts-app-medium') ? 'depth' : 'stack'],
      version: 1,
      fixture: t.fixture,
      flags: '--ambicode-init --context',
      metrics: { source: t.files === false ? 'citations' : 'files-section', relevant: t.relevant, allowed: t.allowed },
      prompt: `/ambicode:investigate --task ${t.slug} ${ask}`,
      bare: ask,
      graders,
    };
  });
}

export { finalFiles };
