// The /ambicode:investigate cases: five broad ones (one per stack fixture, on the base fixtures) and five in depth on ts-app-medium (two of them on its ts-app-medium-deep variant). cases.mjs spreads
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
const T = (slug) => `.ambicode/tasks/${slug}/ledger.jsonl`;
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
// optional bullet, number, backtick, with the decoy path. The old `## Files[\s\S]*decoy` also failed an answer whose
// heading was "## Files that change" and that explained a ruled-out file in the prose below it (optout-files-2, 2026-10-23).
export const decoyPattern = (decoys) =>
  `(?:^|\\n)#{1,6}[ \\t]*Files\\b[^\\n]*(?:\\n(?!#{1,6}[ \\t])[^\\n]*)*?\\n[ \\t]*(?:[-*]|\\d+[.)])?[ \\t]*[\`*]*(?:${decoys.map(escape).join('|')})(?![\\w/-])`;
export const citePattern = (file) => `${escape(tail(file))}:\\d+`;

export function investigateCases(b) {
  const { regex, ledger, llm, shared, noEdits, DONE } = b;
  return INVESTIGATE_TRUTHS.map((t) => {
    const filesRule = t.files === false ? '' : ` ${t.filesRule ?? FILES}`;
    const ask = `${t.question} ${CITE}${filesRule}`;
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
      flags: '--ambicode-init',
      metrics: { source: t.files === false ? 'citations' : 'files-section', relevant: t.relevant, allowed: t.allowed },
      prompt: `/ambicode:investigate --task ${t.slug} ${ask}`,
      bare: ask,
      graders,
    };
  });
}

export { finalFiles };
