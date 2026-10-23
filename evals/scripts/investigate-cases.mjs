// The /ambicode:investigate cases: ten broad ones (two per stack fixture) and five in depth on ts-app-medium (two of them on its ts-app-medium-deep variant). cases.mjs spreads
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
    name: 'investigate-ts-late-fee-wiring', slug: 'inv-fee', fixture: 'ts-service-lendbox',
    description: 'Follow a late fee from the return of a tool to the invoice on a bounded-context service.',
    question: 'A member returns a borrowed tool three days after its due date. How is the late fee worked out, and does the member end up with an invoice for it?',
    relevant: ['src/contexts/lending/application/return.ts', 'src/contexts/lending/domain/fees/late.ts', 'src/contexts/billing/application/on-loan-returned.ts', 'src/composition.ts'],
    allowed: ['src/contexts/billing/application/issue-invoice.ts', 'src/contexts/billing/domain/tax.ts', 'src/shared-kernel/events/bus.ts', 'src/shared-kernel/events/event.ts', 'src/shared-kernel/time/period.ts', 'src/contexts/lending/index.ts', 'src/contexts/billing/index.ts', 'src/contexts/lending/http/routes.ts', 'src/contexts/notifications/application/notify.ts', 'src/contexts/notifications/application/templates.ts', 'test/fees.test.ts'],
    decoys: ['src/contexts/lending/domain/fees/damage.ts', 'src/contexts/lending/domain/fees/waiver.ts'],
    cites: ['src/composition.ts', 'src/contexts/lending/domain/fees/late.ts'],
    facts: [['fee-150-cents', '\\b150\\b']],
    verdict: ['not-invoiced-as-wired', `
PASS only if the answer says that, as the code is wired, no invoice is issued from a return: billing's onLoanReturned reacts to lending.loan-returned, but nothing subscribes it to the bus (src/composition.ts wires no subscriber and no billing), so the member is not invoiced.
FAIL if it says the member is invoiced, or describes a subscription that does not exist. Naming onLoanReturned and issueInvoice as the code that would invoice is fine.`],
    anchors: [['src/contexts/lending/domain/fees/late.ts', 'CENTS_PER_LATE_DAY = 50'], ['src/contexts/lending/application/return.ts', "name: 'lending.loan-returned'"], ['src/contexts/billing/application/on-loan-returned.ts', 'issueInvoice(deps)']],
    absent: [{ find: '.subscribe(' }, { find: 'billing', in: 'src/composition.ts' }, { find: 'onLoanReturned', except: ['src/contexts/billing/application/on-loan-returned.ts', 'src/contexts/billing/index.ts'] }],
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
PASS only if the answer says nothing enforces the per-member loan limit when a loan is started: loanLimit (3 basic, 5 plus, in members/domain/tier.ts) exists, but borrowItem does not call it, and no route or other code does.
FAIL if it names borrowItem, a route or any other code as enforcing the limit, or invents a check.`],
    anchors: [['src/contexts/members/domain/tier.ts', "tier === 'plus' ? 5 : 3"], ['src/contexts/lending/application/borrow.ts', 'isLendable(itemId)'], ['src/composition.ts', 'isLendable: async () => true']],
    absent: [{ find: 'loanLimit', except: ['src/contexts/members/domain/tier.ts'] }, { find: 'canBorrow', except: ['src/contexts/members/domain/standing.ts'] }],
  },
  {
    name: 'investigate-py-cli-empty-store', slug: 'inv-cli', fixture: 'py-service-tidewatch',
    description: 'Follow a command line call through a layered service to the text it prints.',
    question: 'What does `python -m tidewatch.cli.main dover 6` print when the program has just started, and why?',
    relevant: ['src/tidewatch/cli/main.py', 'src/tidewatch/infra/wiring.py', 'src/tidewatch/app/queries/latest.py', 'src/tidewatch/api/handlers/window.py', 'src/tidewatch/cli/render.py'],
    allowed: ['src/tidewatch/app/queries/forecast.py', 'src/tidewatch/infra/store/memory.py', 'src/tidewatch/api/replies.py', 'src/tidewatch/domain/errors.py', 'src/tidewatch/app/services.py', 'src/tidewatch/app/ports/store.py', 'src/tidewatch/domain/rules/staleness.py', 'src/tidewatch/domain/rules/window.py', 'src/tidewatch/app/commands/ingest.py'],
    decoys: [],
    cites: ['src/tidewatch/infra/wiring.py', 'src/tidewatch/app/queries/latest.py'],
    facts: [['code-tw-101', 'TW-101']],
    verdict: ['empty-store-is-why', `
PASS only if the answer says the command prints a failure with the unknown-gauge code TW-101, because the store that infra/wiring.py builds starts empty and nothing on the command's path ever adds readings.
FAIL if it says the command prints hourly water heights, or that it fails for staleness or window length, or names another code as the fresh-start result.`],
    anchors: [['src/tidewatch/infra/wiring.py', 'MemoryStore(capacity=settings.capacity)'], ['src/tidewatch/app/queries/latest.py', 'raise UnknownGaugeError("TW-101"'], ['src/tidewatch/cli/render.py', "return f\"failed {reply['code']}\""]],
    absent: [{ find: 'commands.ingest', except: [] }, { find: 'plugin_named', except: ['src/tidewatch/plugins/registry.py', 'tests/test_plugins.py'] }, { find: '.subscribe(' }],
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
    name: 'investigate-go-quote-price', slug: 'inv-quote', fixture: 'go-module-parcelhub',
    description: 'Work out a printed price from a command line call across small packages.',
    question: 'What does `parcelctl PH-7 1200 north` print for the price, and which code decides each part of that number?',
    relevant: ['cmd/parcelctl/main.go', 'cmd/parcelctl/print.go', 'internal/pricing/price.go', 'internal/pricing/surcharge.go', 'internal/rates/lookup.go', 'internal/rates/table.go'],
    allowed: ['cmd/parcelctl/flags.go', 'internal/labels/label.go', 'internal/core/types.go', 'internal/core/errors.go', 'internal/rates/rates_test.go'],
    decoys: ['internal/routing/zones.go', 'internal/routing/table.go', 'internal/customs/limits.go'],
    cites: ['internal/pricing/surcharge.go', 'internal/rates/table.go'],
    facts: [['price-7-40', '7\\.40|\\b740\\b']],
    verdict: null,
    anchors: [['internal/rates/table.go', '{UpToGrams: 2000, Cents: 620}'], ['internal/pricing/surcharge.go', 'zone == "hub"'], ['cmd/parcelctl/print.go', 'price: %d.%02d']],
    absent: [{ find: 'internal/routing"' }, { find: 'internal/customs"' }],
  },
  {
    name: 'investigate-go-max-weight', slug: 'inv-weight', fixture: 'go-module-parcelhub',
    description: 'Find where a limit lives in a repository of small packages.',
    question: 'What is the heaviest parcel parcelhub can price, and where is that limit enforced?',
    relevant: ['internal/rates/table.go', 'internal/rates/lookup.go'],
    allowed: ['internal/pricing/price.go', 'cmd/parcelctl/main.go', 'internal/core/errors.go', 'internal/rates/rates_test.go'],
    decoys: ['internal/customs/limits.go', 'internal/carrier/regional/sortline/belt/sensor/thresholds.go'],
    cites: ['internal/rates/table.go', 'internal/rates/lookup.go'],
    facts: [['limit-10-kg', '10[,_ ]?000|\\b10 ?kg']],
    verdict: null,
    anchors: [['internal/rates/table.go', '{UpToGrams: 10000, Cents: 1450}'], ['internal/rates/lookup.go', 'rates.CentsFor: %w'], ['internal/customs/limits.go', 'MaxValueCents']],
    absent: [{ find: 'MaxGrams' }, { find: 'MaxWeight' }],
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
PASS only if the answer says the sowing message is built by the handler that Wiring.kt subscribes to the "lot.sown" topic of the in-process bus, is addressed to the fallback desk@example.org (the recipients map is empty), and is only printed to the console: nothing sends mail. The outbox classes are not on this path.
FAIL if it routes the message through the outbox or the Drainer, or says a real mail is sent.`],
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
PASS only if the answer says the limit (13_000 tenths of a degree) is enforced in the engine (safety limits, applied when a Schedule is built) and separately in the dashboard (its own constant, applied to the segments of a new firing), and that the Python tools enforce no setpoint limit (their only limit is a calibration offset).
FAIL if it says the tools enforce the setpoint limit, or that the dashboard takes the constant from the engine.`],
    anchors: [['engine/crates/safety/src/limits.rs', 'MAX_SETPOINT_DC: i32 = 13_000'], ['engine/crates/schedule/src/plan.rs', 'check_setpoint_dc(segment.target_dc)'], ['dashboard/src/lib/validate/limits.ts', 'MAX_SETPOINT_DC = 13_000'], ['dashboard/src/services/firings.ts', 'checkSegments(segments)'], ['tools/src/kilnlab/config/limits.py', 'MAX_OFFSET_DC = 200']],
    absent: [{ find: 'SETPOINT', in: 'tools/' }],
  },
  {
    name: 'investigate-mono-cli-target', slug: 'inv-glaze', fixture: 'monorepo-rust-ts-kiln',
    description: 'Follow a Rust workspace command through its crates.',
    question: 'What does the engine command line tool do with the argument `glaze`: how is the target temperature chosen for each minute, and what sets the power of the simulated kiln?',
    relevant: ['engine/crates/cli/src/main.rs', 'engine/crates/cli/src/args.rs', 'engine/crates/schedule/src/ramp/profiles/glaze.rs', 'engine/crates/schedule/src/plan.rs', 'engine/crates/sim/src/run.rs', 'engine/crates/controller/src/pid.rs'],
    allowed: ['engine/crates/cli/src/report.rs', 'engine/crates/sim/src/kiln.rs', 'engine/crates/schedule/src/segment.rs', 'engine/crates/safety/src/limits.rs', 'engine/crates/telemetry/src/stats.rs', 'engine/crates/telemetry/src/sample.rs', 'engine/crates/units/src/temperature.rs'],
    decoys: ['engine/crates/schedule/src/ramp/linear.rs', 'engine/crates/schedule/src/ramp/curve.rs', 'engine/crates/controller/src/relay.rs', 'engine/crates/controller/src/drivers/relay_board.rs', 'engine/crates/controller/src/drivers/thermocouple.rs'],
    cites: ['engine/crates/sim/src/run.rs', 'engine/crates/controller/src/pid.rs'],
    facts: [['glaze-top-12400', '12[_,]?400']],
    verdict: ['step-target-pid-power', `
PASS only if the answer says each minute's target is the target of the segment that minute falls in (Schedule::target_at_dc), so it steps to the next segment's value (6000 then 12400 tenths of a degree for glaze) with no ramp in between, and that the simulated power comes from the Pid.
FAIL if it says the ramp or curve code shapes the target, or that the relay controller drives the simulation.`],
    anchors: [['engine/crates/schedule/src/ramp/profiles/glaze.rs', 'target_dc: 12_400'], ['engine/crates/schedule/src/plan.rs', 'pub fn target_at_dc'], ['engine/crates/sim/src/run.rs', 'pid.step(schedule.target_at_dc(minute)']],
    absent: [{ find: 'ramp_dc(', except: ['engine/crates/schedule/src/ramp/linear.rs'] }, { find: 'ease_thousandths(', except: ['engine/crates/schedule/src/ramp/curve.rs'] }, { find: 'Relay::new' }, { find: 'ramp::linear' }, { find: 'ramp::curve' }],
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
