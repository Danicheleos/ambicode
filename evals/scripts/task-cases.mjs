// The /ambicode:task cases. cases.mjs spreads `taskCases`.
//
// Broad: three cases on each init stack (fixtures/init-stacks.mjs), one that starts after a plan, one after an investigation and
// one from a bare request. The first two carry the earlier route's note and ledger line as `seed/...` files (task-seeds.mjs),
// which the scaffold copies into .ambicode/. Their bare arm gets the same note as text in the prompt (a plan to implement, an
// investigation's findings to build on), so the baseline has the same input and only the route differs. Narrow: five cases on the app fixtures that exercise one task behaviour each.
//
// Every expectation is read from the fixture as materialized (fixtures/definitions.mjs, init-stacks.mjs, app-medium.mjs); the stack
// fixtures are materialized without --install, so their runs have no runnable check and are graded on the code and the test file.
// Graders are regexes on the files the change touches and on the ledger, never a model reading a source file.
import { INVESTIGATIONS, PLANS, seedFiles } from './task-seeds.mjs';

const T = (slug) => `.ambicode/tasks/${slug}/ledger.jsonl`;
// A headless request gets the review offer as a gate whose default skips it; a case that wants the review answers the offer with run, as a user would.
const PROMPT = (slug, request, { review = false } = {}) => `/ambicode:task --task ${slug} --headless ${review ? '--answer review-offer=run ' : 'iteration 1 '}${request}`;
const GIT = 'git (commit|push|stash|reset|checkout|clean|merge|rebase)';
const REPORT = 'Task report[\\s\\S]*\\*\\*Done\\*\\*';
// check entries are written as {kind, key, files, exit, phase} (src/modules/checks/run/check-command.ts)
const GREEN = '"kind":"check"[^\\n]*"exit":0,"phase":"green"';
// A failing check of the change with no later passing one: the run ended red.
const RED_LEFT = '"exit":[1-9][0-9]*,"phase":"green"(?![\\s\\S]*"exit":0,"phase":"green")';

export function taskCases(B) {
  const { regex, ledger, never, exists, shared, DONE } = B;
  const file = (name, pattern, path, options = {}) => regex(name, pattern, { file: path, ...options });
  const sharedFile = (name, pattern, path, options = {}) => shared(file(name, pattern, path, options));
  const noGit = (isShared) => (isShared ? shared(never('no-git-mutation', 'Bash', GIT)) : never('no-git-mutation', 'Bash', GIT));
  const report = () => regex('report-sections', REPORT);
  const untouched = (name, where) => [never(`${name}-not-edited`, 'Edit', where), never(`${name}-not-written`, 'Write', where)];
  // The task route's policy row (stage before-work, activity task) lists the rule ids delivered whole; a missing row means the rule never reached the change step.
  const delivered = (slug, id) => ledger(`policy-delivered-${id.split('/')[1]}`, String.raw`(?:^|\n)(?=[^\n]*"kind":"policy")(?=[^\n]*"activity":"task")(?=[^\n]*"ids":\[[^\]]*"${id}")`, T(slug));

  // The bare counterpart of a seeded case: the note's text in the prompt instead of a file the route picks up. Plain words, no AMBICODE names.
  const bareNote = (kind, text, request) =>
    kind === 'plan'
      ? `Implement the accepted plan below in this repository: ${request === 'Go ahead with the plan.' ? 'make the changes it lists and add the tests it asks for.' : request}\n\n${text.trim()}`
      : `${request}\n\nAn earlier investigation of this code found the following; build on it.\n\n${text.trim()}`;
  // A grader that reads the ledger or .ambicode/ cannot run without the plugin; the rest judges the code and the boundary in both arms.
  const sharedIfCode = (g) => (g.shared || g.text.includes('.ambicode/') ? g : shared(g));

  /** After a plan / an investigation: the plugin arm gets the note as files the route picks up, the bare arm as prompt text. */
  const seeded = ({ name, slug, kind, text, cited, fixture, description, request, graders, tags, flags = '--ambicode-init --context' }) => ({
    name,
    description,
    tags: ['task', 'seeded', ...tags],
    version: 1,
    fixture,
    flags,
    prompt: PROMPT(slug, request),
    bare: bareNote(kind, text, request),
    files: seedFiles(slug, kind, text),
    graders: [
      DONE(T(slug)),
      // task.start records the plan it read (src/skills/task/handlers.ts); the map entry lists the paths an investigation cites, so a file only the note names shows it was read.
      kind === 'plan' ? ledger('plan-picked-up', `"planPath":".ambicode/tasks/${slug}/plan\\.md","iteration":1`, T(slug)) : ledger('investigation-picked-up', `"kind":"map"[^\\n]*${cited}`, T(slug)),
      noGit(true),
      report(),
      ...graders.map(sharedIfCode),
    ],
  });

  /** A bare request: both arms get the same words, graded on the code. */
  const fromRequest = ({ name, slug, fixture, description, request, graders, tags }) => ({
    name,
    description,
    tags: ['task', 'bare-request', ...tags],
    version: 1,
    fixture,
    flags: '--ambicode-init --context',
    prompt: PROMPT(slug, request),
    bare: `${request}`,
    graders: [DONE(T(slug)), report(), noGit(true), ...graders],
  });

  const afterPlan = (o) => seeded({ ...o, kind: 'plan', text: PLANS[o.slug], description: `After a plan: ${o.description}` });
  const afterInvestigation = (o) => seeded({ ...o, kind: 'investigation', text: INVESTIGATIONS[o.slug], description: `After an investigation: ${o.description}` });

  // ---------------------------------------------------------------- ts-service-lendbox (jest, bounded contexts, index.ts boundaries)
  const lendbox = [
    afterPlan({
      name: 'task-ts-after-plan', slug: 'lb-extend', fixture: 'ts-service-lendbox', tags: ['ts'],
      description: 'extendLoan ignores canExtend/MAX_EXTENSIONS; the accepted plan counts extensions on Loan and refuses the third.',
      request: 'Go ahead with the plan.',
      graders: [
        file('extension-refused-by-rule', 'canExtend\\(', 'src/contexts/lending/application/extend.ts'),
        file('error-code-from-plan', 'extension-limit', 'src/contexts/lending/application/extend.ts'),
        file('loan-counts-extensions', 'extensions', 'src/contexts/lending/domain/loan.ts'),
        exists('plan-test-written', 'test/extend.test.ts'),
      ],
    }),
    afterInvestigation({
      name: 'task-ts-after-investigate', slug: 'lb-waiver', cited: 'on-loan-returned\\.ts', fixture: 'ts-service-lendbox', tags: ['ts'],
      description: 'waive() in lending/domain/fees is never called; returnItem takes an optional waiver reason and applies it before publishing the fee.',
      request: 'Let returnItem take an optional waiver reason and waive the late fee when one is given, using the waiver rule the investigation found. Cover it in test/return.test.ts.',
      graders: [
        file('waiver-reused', 'waive\\(', 'src/contexts/lending/application/return.ts'),
        file('waiver-imported', 'fees/waiver', 'src/contexts/lending/application/return.ts'),
        file('late-fee-kept', 'lateFee\\(', 'src/contexts/lending/application/return.ts'),
        exists('return-test-written', 'test/return.test.ts'),
        file('existing-tests-kept', 'charges nothing for an early return', 'test/fees.test.ts'),
      ],
    }),
    fromRequest({
      name: 'task-ts-bare', slug: 'lb-return-twice', fixture: 'ts-service-lendbox', tags: ['ts'],
      description: 'a second return of the same loan publishes lending.loan-returned again and double-invoices the fee.',
      request: "Returning the same loan twice publishes lending.loan-returned twice, so its late fee is invoiced twice. Make returnItem (src/contexts/lending/application/return.ts) refuse a loan that is already returned with a DomainError coded 'already-returned', leave the first return unchanged, and add a test in test/return.test.ts.",
      graders: [
        sharedFile('already-returned-refused', 'already-returned', 'src/contexts/lending/application/return.ts'),
        sharedFile('checks-returned-on', 'loan\\.returnedOn', 'src/contexts/lending/application/return.ts'),
        shared(exists('return-test-written', 'test/return.test.ts')),
        sharedFile('test-covers-refusal', 'already-returned', 'test/return.test.ts'),
        sharedFile('existing-tests-kept', 'starts a loan due a week later', 'test/borrow.test.ts'),
      ],
    }),
  ];

  // ---------------------------------------------------------------- py-service-tidewatch (pytest, TW-nnn error codes, test_<module>__<behaviour>)
  const tidewatch = [
    afterPlan({
      name: 'task-py-after-plan', slug: 'tw-hours', fixture: 'py-service-tidewatch', tags: ['py'],
      description: 'check_hours accepts 0 and negative hours; the plan adds WindowTooShortError with the free code TW-311.',
      request: 'Go ahead with the plan.',
      graders: [
        file('error-class-added', 'class WindowTooShortError\\(TidewatchError\\)', 'src/tidewatch/domain/errors.py'),
        file('free-code-used', 'TW-311', 'src/tidewatch/domain/rules/window.py'),
        file('named-test-added', 'def test_forecast__rejects_window_under_one_hour', 'tests/test_forecast.py'),
        file('existing-tests-kept', 'test_forecast__rejects_window_over_two_days', 'tests/test_forecast.py'),
      ],
    }),
    afterInvestigation({
      name: 'task-py-after-investigate', slug: 'tw-start', cited: 'domain/models\\.py', fixture: 'py-service-tidewatch', tags: ['py'],
      description: 'forecast_window takes start and drops it; build_window labels the window with the reading time.',
      request: 'Make forecast_window honour its start argument, as the investigation found it ignored. Add the test to tests/test_forecast.py, named like the file\'s other tests.',
      graders: [
        file('start-passed-down', 'build_window\\([^)]*start=start', 'src/tidewatch/app/queries/forecast.py'),
        file('window-uses-start', 'start=start', 'src/tidewatch/domain/rules/window.py'),
        file('named-test-added', 'def test_forecast__\\w*start', 'tests/test_forecast.py'),
        file('existing-tests-kept', 'test_forecast__window_has_one_height_per_hour', 'tests/test_forecast.py'),
      ],
    }),
    fromRequest({
      name: 'task-py-bare', slug: 'tw-future', fixture: 'py-service-tidewatch', tags: ['py'],
      description: 'require_fresh checks only age above MAX_AGE, so a future-stamped reading passes; the new error needs an unused TW code.',
      request: 'A reading stamped in the future (a gauge with a skewed clock) passes require_fresh in src/tidewatch/domain/rules/staleness.py, because only an age above MAX_AGE is checked. Reject a reading more than 5 minutes ahead of now with a new TidewatchError subclass and a new TW code (follow CONTRIBUTING.md), and add a test in tests/test_staleness.py.',
      graders: [
        // Every code the fixture's src/ already holds: a raise of any other TW-nnn is a new one.
        sharedFile('new-code-raised', 'raise \\w+\\("TW-(?!(?:101|102|120|121|203|310|400|401|402|403|404|405|406|407|408|409|410|411|412)")[0-9]{3}"', 'src/tidewatch/domain/rules/staleness.py'),
        sharedFile('named-test-added', 'def test_staleness__\\w*(future|ahead|skew)', 'tests/test_staleness.py'),
        sharedFile('stale-check-kept', 'MAX_AGE', 'src/tidewatch/domain/rules/staleness.py'),
        sharedFile('existing-tests-kept', 'test_staleness__rejects_stale_reading', 'tests/test_staleness.py'),
      ],
    }),
  ];

  // ---------------------------------------------------------------- go-module-parcelhub (go test, wrapped errors, injected clock)
  const parcelhub = [
    afterPlan({
      name: 'task-go-after-plan', slug: 'ph-weight', fixture: 'go-module-parcelhub', tags: ['go'],
      description: 'rates.CentsFor prices a 0-gram parcel at the first band; the plan returns core.ErrInvalid wrapped as rates.CentsFor.',
      request: 'Go ahead with the plan.',
      graders: [
        file('non-positive-refused', 'grams (<= 0|< 1)', 'internal/rates/lookup.go'),
        // The refusal comes before the band loop, wrapped as the file's last line already is.
        file('refusal-wrapped-as-contributing', 'grams (<= 0|< 1)[^\\n]*\\{\\s*return 0, fmt\\.Errorf\\("rates\\.CentsFor: %w", core\\.ErrInvalid\\)', 'internal/rates/lookup.go'),
        // A zero weight as a literal argument, in a []int loop list, or as the first field of a table row.
        file('zero-weight-tested', 'CentsFor\\(0\\)|\\[\\]int\\{[^}]*\\b0\\b|\\{\\s*(?:\\w+:\\s*)?0\\s*[,}]', 'internal/rates/rates_test.go'),
        file('existing-tests-kept', 'TestCentsForPicksTheFirstBandThatFits', 'internal/rates/rates_test.go'),
      ],
    }),
    afterInvestigation({
      // --policy: the project pack with the injected-clock rule (fixtures/policies/go-module-parcelhub.yaml, appliesTo **/*.go).
      name: 'task-go-after-investigate', slug: 'ph-advance', cited: 'tracking/history\\.go', fixture: 'go-module-parcelhub', tags: ['go'], flags: '--ambicode-init --context --policy',
      description: 'tracking.Advance accepts any state after Delivered; IsDelivered exists in the package and the clock is injected.',
      request: 'Make tracking.Advance refuse a parcel that is already delivered, reusing what the investigation found, and test it in internal/tracking/tracking_test.go.',
      graders: [
        file('existing-helper-reused', 'IsDelivered\\(', 'internal/tracking/service.go'),
        file('invalid-error-returned', 'core\\.ErrInvalid', 'internal/tracking/service.go'),
        file('no-wall-clock', 'time\\.Now', 'internal/tracking/service.go', { match: 'not_contains' }),
        delivered('ph-advance', 'parcelhub-team/injected-clock'),
        // The refusal reuses IsDelivered or LastState; a hand-written index of the newest scan in service.go is the duplicate this grader catches.
        file('no-second-state-scan', 'Scans\\[len\\(', 'internal/tracking/service.go', { match: 'not_contains' }),
        file('refusal-tested', 'Delivered', 'internal/tracking/tracking_test.go'),
        file('existing-tests-kept', 'TestAdvanceRecordsTheScanTime', 'internal/tracking/tracking_test.go'),
      ],
    }),
    fromRequest({
      name: 'task-go-bare', slug: 'ph-zone', fixture: 'go-module-parcelhub', tags: ['go'],
      description: 'pricing.Quote surcharges a parcel with an empty zone because only "hub" is exempt.',
      request: 'pricing.Quote (internal/pricing/price.go) adds the 120-cent surcharge to a parcel with an empty Zone, because anything but "hub" is surcharged. Make Quote return core.ErrInvalid for an empty Zone, wrapped the way CONTRIBUTING.md asks, and add a test in internal/pricing/price_test.go.',
      graders: [
        sharedFile('empty-zone-refused', 'Zone == ""|len\\(parcel\\.Zone\\) == 0', 'internal/pricing/price.go'),
        sharedFile('error-wrapped-as-contributing', 'Errorf\\("pricing\\.Quote: %w", core\\.ErrInvalid\\)', 'internal/pricing/price.go'),
        shared(exists('price-test-written', 'internal/pricing/price_test.go')),
        sharedFile('test-checks-the-error', 'ErrInvalid', 'internal/pricing/price_test.go'),
        sharedFile('existing-tests-kept', 'TestCentsForPicksTheFirstBandThatFits', 'internal/rates/rates_test.go'),
      ],
    }),
  ];

  // ---------------------------------------------------------------- jvm-gradle-seedvault (hexagonal Gradle build, Outcome results)
  const sowing = 'application/src/main/kotlin/org/seedvault/application/usecase/germination';
  const reportDir = 'application/src/main/kotlin/org/seedvault/application/usecase/report';
  const testRoot = 'application/src/test/kotlin/org/seedvault/application/usecase';
  const seedvault = [
    afterPlan({
      name: 'task-jvm-after-plan', slug: 'sv-trays', fixture: 'jvm-gradle-seedvault', tags: ['jvm'],
      description: 'SowLotService sows a lot for 0 trays; the plan rejects trays < 1 before the lot is saved.',
      request: 'Go ahead with the plan.',
      graders: [
        file('trays-refused', 'trays (< 1|<= 0)', `${sowing}/SowLotService.kt`),
        file('rejection-is-an-outcome', 'trays (< 1|<= 0)[\\s\\S]{0,120}Outcome\\.Rejected', `${sowing}/SowLotService.kt`),
        file('named-test-added', 'fun rejectsZeroTrays', `${testRoot}/germination/SowLotServiceTest.kt`),
        file('existing-tests-kept', 'fun sowsViableLot', `${testRoot}/germination/SowLotServiceTest.kt`),
      ],
    }),
    afterInvestigation({
      name: 'task-jvm-after-investigate', slug: 'sv-floor', cited: 'lot/Viability\\.kt', fixture: 'jvm-gradle-seedvault', tags: ['jvm'],
      description: 'viabilityBands repeats the literal 50 of VIABILITY_FLOOR_PERCENT and has no test.',
      request: 'Make viabilityBands use the domain constant the investigation found instead of its own literal, and add ViabilityBandsTest.kt for it in the report test folder, next to the germination one.',
      graders: [
        file('constant-reused', 'VIABILITY_FLOOR_PERCENT', `${reportDir}/ViabilityBands.kt`),
        file('literal-removed', '>= 50', `${reportDir}/ViabilityBands.kt`, { match: 'not_contains' }),
        exists('bands-test-written', `${testRoot}/report/ViabilityBandsTest.kt`),
        file('existing-tests-kept', 'fun rejectsUnknownLot', `${testRoot}/germination/SowLotServiceTest.kt`),
      ],
    }),
    fromRequest({
      name: 'task-jvm-bare', slug: 'sv-capacity', fixture: 'jvm-gradle-seedvault', tags: ['jvm'],
      description: 'TrayPlanner divides by trayCapacity, so a capacity of 0 throws ArithmeticException.',
      request: `TrayPlanner (${sowing}/TrayPlanner.kt) divides by trayCapacity, so a capacity of 0 throws ArithmeticException from traysFor. Refuse a capacity below 1 when the planner is built (require, with a message), and add TrayPlannerTest.kt next to SowLotServiceTest.kt covering it and one normal plan: capacity 10 and 25 seeds give trays T-001 to T-003.`,
      graders: [
        sharedFile('capacity-required', 'require\\(trayCapacity (> 0|>= 1)', `${sowing}/TrayPlanner.kt`),
        shared(exists('planner-test-written', `${testRoot}/germination/TrayPlannerTest.kt`)),
        sharedFile('test-covers-names', 'T-003', `${testRoot}/germination/TrayPlannerTest.kt`),
        sharedFile('test-covers-refusal', 'assertFailsWith|assertThrows', `${testRoot}/germination/TrayPlannerTest.kt`),
        sharedFile('existing-tests-kept', 'fun sowsViableLot', `${testRoot}/germination/SowLotServiceTest.kt`),
      ],
    }),
  ];

  // ---------------------------------------------------------------- monorepo-rust-ts-kiln (Rust engine, TS dashboard, Python tools; _dc units, generated client)
  const kiln = [
    afterPlan({
      name: 'task-monorepo-after-plan', slug: 'kl-minutes', fixture: 'monorepo-rust-ts-kiln', tags: ['monorepo', 'ts'],
      description: 'the dashboard checks only targetDc of a segment; the plan adds a positive-integer minutes check that throws SetpointError (422).',
      request: 'Go ahead with the plan.',
      graders: [
        file('minutes-checked', 'Number\\.isInteger\\([^)]*minutes', 'dashboard/src/lib/validate/segments.ts'),
        file('same-error-reused', 'SetpointError', 'dashboard/src/lib/validate/segments.ts'),
        file('target-check-kept', 'isSetpointDc', 'dashboard/src/lib/validate/segments.ts'),
        exists('segments-test-written', 'dashboard/test/segments.test.ts'),
        ...untouched('generated-client', '__generated__'),
      ],
    }),
    afterInvestigation({
      name: 'task-monorepo-after-investigate', slug: 'kl-zero', cited: 'ramp/linear\\.rs', fixture: 'monorepo-rust-ts-kiln', tags: ['monorepo', 'rust'],
      description: 'Schedule::new accepts a zero-minute segment that target_at_dc then skips; the change stays in the Rust engine.',
      request: 'Make Schedule::new in the engine refuse a segment of zero minutes with its own ScheduleError variant, as the investigation found it accepted, and cover it in engine/crates/schedule/tests/firing.rs.',
      graders: [
        file('zero-minutes-refused', 'minutes == 0|minutes < 1', 'engine/crates/schedule/src/plan.rs'),
        file('no-bare-unwrap', '\\.unwrap\\(\\)', 'engine/crates/schedule/src/plan.rs', { match: 'not_contains' }),
        file('refusal-tested', 'minutes: 0', 'engine/crates/schedule/tests/firing.rs'),
        file('existing-tests-kept', 'target_follows_the_segments', 'engine/crates/schedule/tests/firing.rs'),
        ...untouched('generated-client', '__generated__'),
      ],
    }),
    fromRequest({
      name: 'task-monorepo-bare', slug: 'kl-offset', fixture: 'monorepo-rust-ts-kiln', tags: ['monorepo', 'py'],
      description: 'offset_dc of an empty log divides by zero in mean(); the change is in the Python tools project only.',
      request: "In the Python tools, offset_dc (tools/src/kilnlab/calibration/fit.py) raises ZeroDivisionError on an empty list of pairs. Raise ValueError('no calibration pairs') instead, and add a test in tools/tests/test_calibration.py.",
      graders: [
        sharedFile('empty-refused', "ValueError\\('no calibration pairs'\\)", 'tools/src/kilnlab/calibration/fit.py'),
        sharedFile('refusal-tested', 'pytest\\.raises\\(ValueError', 'tools/tests/test_calibration.py'),
        sharedFile('existing-tests-kept', 'test_fit_averages_the_differences[\\s\\S]*test_csv_lists_kilns_in_order', 'tools/tests/test_calibration.py'),
        shared(never('engine-not-edited', 'Edit', 'engine/')),
      ],
    }),
  ];

  // ---------------------------------------------------------------- ts-app-medium: one task behaviour each, jest installed so the checks run
  const app = { flags: '--ambicode-init --context --install', version: 1 };
  const appCases = [
    {
      ...app,
      name: 'task-app-refund-multi-file',
      description: 'A refund defect across three files of the payments module (repository sign, invoice status, bare Error), with the regression test in the factory style; the tests that guarded it were dropped from the fixture.',
      tags: ['task', 'multi-file', 'regression-test'],
      fixture: 'ts-app-medium-refund-bug',
      prompt: PROMPT('fix-refund', 'Refunds are broken: after a partial refund on a fully paid invoice, the invoice still shows as paid, and refunding more than was paid crashes the API. Fix both and cover them with tests.'),
      bare: `Refunds are broken: after a partial refund on a fully paid invoice, the invoice still shows as paid, and refunding more than was paid crashes the API. Fix both and cover them with tests.`,
      graders: [
        DONE(T('fix-refund')),
        ledger('green-check-recorded', GREEN, T('fix-refund')),
        ledger('format-recorded', '"kind":"format"', T('fix-refund')),
        report(),
        noGit(true),
        sharedFile('repository-subtracts-refunds', "KIND\\.REFUND|'refund'", 'src/payments/repository.js'),
        sharedFile('status-synced-after-refund', 'function refund[\\s\\S]*syncStatus', 'src/payments/service.js'),
        sharedFile('error-classified', 'throw new Error\\(', 'src/payments/service.js', { match: 'not_contains' }),
        // The net is the repository's to compute (the fix is there); a reduce in the service is the same arithmetic copied into the caller.
        sharedFile('no-net-recomputed-in-service', '\\.reduce\\(', 'src/payments/service.js', { match: 'not_contains' }),
        delivered('fix-refund', 'common-design/fix-the-cause'),
        // The crash is the service throwing a bare Error; catching it in the route or the http layer would fix the symptom in a leaf.
        shared(never('no-leaf-catch', 'Edit', 'src/(payments/routes|shared/http)')),
        sharedFile('regression-test-added', 'payments\\.refund\\([\\s\\S]{0,300}partially_paid', 'tests/payments/payments.test.js'),
        sharedFile('existing-tests-kept', 'rejects a refund above what was paid[\\s\\S]*a refund is stored beside the payment', 'tests/payments/payments.test.js'),
        shared(never('legacy-not-edited', 'Edit', 'src/legacy')),
      ],
    },
    {
      ...app,
      name: 'task-app-reuse-report-helpers',
      description: 'A new report that must go through the reports service\'s own groupBy and total, not a new grouping loop, with its route and a test.',
      tags: ['task', 'reuse'],
      fixture: 'ts-app-medium',
      prompt: PROMPT('revenue-customer', 'Add a revenue-by-customer report (revenueByCustomer): the totals of fully paid invoices grouped by customer id, in the same row shape as the other customer report, served at GET /reports/revenue-by-customer, with tests.'),
      bare: `Add a revenue-by-customer report (revenueByCustomer): the totals of fully paid invoices grouped by customer id, in the same row shape as the other customer report, served at GET /reports/revenue-by-customer, with tests.`,
      graders: [
        DONE(T('revenue-customer')),
        ledger('green-check-recorded', GREEN, T('revenue-customer')),
        report(),
        noGit(true),
        sharedFile('service-reuses-group-by', 'function revenueByCustomer\\(\\)[\\s\\S]{0,300}groupBy\\(', 'src/reports/service.js'),
        sharedFile('no-second-grouping-loop', 'new Map\\([\\s\\S]*new Map\\(', 'src/reports/service.js', { match: 'not_contains' }),
        delivered('revenue-customer', 'common-design/reuse-before-reimplementing'),
        // Other sites that group by customer (top-customers, a new report module) are the tempting copies; the service's groupBy is the owner.
        shared(never('no-other-grouping-site', 'Edit', 'src/reports/(top-customers|csv|aging)')),
        shared(never('no-new-report-module', 'Write', '"file_path":"[^"]*/src/reports/(?!service|routes)')),
        sharedFile('service-exports-it', 'module\\.exports = \\{[^}]*revenueByCustomer', 'src/reports/service.js'),
        sharedFile('route-added', '/reports/revenue-by-customer', 'src/reports/routes.js'),
        sharedFile('route-calls-service', 'service\\.revenueByCustomer\\(', 'src/reports/routes.js'),
        // The harness reads one fixed file per grader; a service-level and a route-level test are equally good (a baseline run chose routes.test.js), so the trace is read: one tool call naming either test file and revenueByCustomer.
        shared(regex('test-added', String.raw`tests/reports/(?:service|routes)\.test\.js[^\n]*revenueByCustomer`, { trace: true })),
        sharedFile('existing-tests-kept', 'revenue counts only paid invoices, per issue month', 'tests/reports/service.test.js'),
      ],
    },
    {
      ...app,
      name: 'task-app-review-fix-loop',
      description: 'New behaviour behind a flag in a project with rules (flag, opt-out, templates, factory tests); the review offer is answered run, so the independent review runs and its findings, if any, go back to the fix step.',
      tags: ['task', 'review', 'fix-loop'],
      fixture: 'ts-app-medium',
      // Reviews and fixes take more steps than a bare change; 60 turns keeps a second fix round inside the budget.
      limits: { max_turns: 60, timeout_seconds: 1800 },
      prompt: PROMPT('refund-mail', "Mail the customer when a refund is recorded: onPaymentRefunded in src/notifications/handlers.js only logs today. Reuse the existing delivery and template style, respect customers who opted out of receipts, and ship it behind a new flag refundEmails, off by default. Test it in tests/notifications/handlers.test.js.", { review: true }),
      bare: null,
      graders: [
        DONE(T('refund-mail')),
        ledger('green-check-recorded', GREEN, T('refund-mail')),
        ledger('review-recorded', '"kind":"review"', T('refund-mail')),
        // Passes when the review had no finding; when it had one, a passing check must follow.
        ledger('findings-fixed-and-checked', '^(?![\\s\\S]*"reason":"review-findings")|"reason":"review-findings"[\\s\\S]*"exit":0,"phase":"green"', T('refund-mail')),
        ledger('no-check-left-red', RED_LEFT, T('refund-mail'), { match: 'not_contains' }),
        report(),
        noGit(false),
        file('flag-declared-off', 'refundEmails: false', 'src/flags.js'),
        file('handler-checks-flag', "function onPaymentRefunded[\\s\\S]*isEnabled\\('refundEmails'\\)", 'src/notifications/handlers.js'),
        file('handler-respects-opt-out', 'function onPaymentRefunded[\\s\\S]*contact\\.receipts', 'src/notifications/handlers.js'),
        file('handler-reuses-delivery', 'function onPaymentRefunded[\\s\\S]*service\\.deliver\\(', 'src/notifications/handlers.js'),
        file('template-formats-money', '[Rr]efund\\w*\\([\\s\\S]{0,400}money\\.format', 'src/notifications/templates.js'),
        file('handler-tested-with-flag', "flags\\.set\\('refundEmails'", 'tests/notifications/handlers.test.js'),
      ],
    },
    {
      ...app,
      name: 'task-app-checks-fail-first',
      description: 'A third aging bucket makes existing expectations (the 60+ label) obsolete: the first check run of the related tests can fail, and the run must end with those tests updated and green.',
      tags: ['task', 'failing-checks'],
      fixture: 'ts-app-medium',
      prompt: PROMPT('aging-bucket', 'Add a third aging bucket: invoices 61 to 90 days old are labelled 61-90 and older ones 90+, so the boundaries are 30, 60 and 90 days. Keep the whole suite green.'),
      bare: `Add a third aging bucket: invoices 61 to 90 days old are labelled 61-90 and older ones 90+, so the boundaries are 30, 60 and 90 days. Keep the whole suite green.`,
      graders: [
        DONE(T('aging-bucket')),
        ledger('green-check-recorded', GREEN, T('aging-bucket')),
        ledger('no-check-left-red', RED_LEFT, T('aging-bucket'), { match: 'not_contains' }),
        report(),
        noGit(true),
        sharedFile('config-has-third-boundary', 'agingBucketsDays: \\[30, 60, 90\\]', 'src/config.js'),
        sharedFile('old-last-label-replaced', "return second \\+ '\\+'", 'src/reports/aging.js', { match: 'not_contains' }),
        sharedFile('aging-test-covers-new-bucket', '61-90', 'tests/reports/aging.test.js'),
        // The labels come from config.agingBucketsDays; a literal 60 or 90 in aging.js code copies the config into the function. Lines with a `/` before the number are skipped: the baseline runs kept the fixture's comment `with [30, 60, 90] they are ...` and failed on it.
        sharedFile('no-literal-boundaries', '(?:^|\\n)[^\\n/*]*\\b(60|90)\\b', 'src/reports/aging.js', { match: 'not_contains' }),
        sharedFile('old-label-gone-from-service-test', "'60\\+'", 'tests/reports/service.test.js', { match: 'not_contains' }),
        sharedFile('existing-tests-kept', 'daysBetween counts calendar days', 'tests/reports/aging.test.js'),
      ],
    },
    {
      ...app,
      name: 'task-app-segments-void',
      description: 'customers/segments.js counts void invoices in the lifetime spend although reports/top-customers.js excludes them; the fix must keep the three existing tests and add one regression test.',
      tags: ['task', 'existing-tests', 'regression-test'],
      fixture: 'ts-app-medium-sites',
      prompt: PROMPT('segments-void', "A customer whose large invoice was voided is still classed gold, still counted in the description of their segment, and still billed on their account statement. Voided invoices must not count for any of them, as in the top customers report. Add a regression test."),
      bare: `A customer whose large invoice was voided is still classed gold, still counted in the description of their segment, and still billed on their account statement. Voided invoices must not count for any of them, as in the top customers report. Add a regression test.`,
      graders: [
        DONE(T('segments-void')),
        ledger('green-check-recorded', GREEN, T('segments-void')),
        ledger('format-recorded', '"kind":"format"', T('segments-void')),
        report(),
        noGit(true),
        sharedFile('void-excluded', "STATUS\\.VOID|'void'|illable", 'src/customers/segments.js'),
        sharedFile('regression-test-added', 'voidInvoice', 'tests/customers/segments.test.js'),
        // Both readers of the invoice list share one filter: two invoices.list calls, or two void checks, in segments.js mean the rule was written in each leaf.
        sharedFile('one-list-call', 'invoices\\.list\\(\\{ customerId \\}\\)[\\s\\S]*invoices\\.list\\(\\{ customerId \\}\\)', 'src/customers/segments.js', { match: 'not_contains', weight: 2 }),
        sharedFile('no-void-rule-in-both-readers', "(STATUS\\.VOID|'void')[\\s\\S]*(STATUS\\.VOID|'void')", 'src/customers/segments.js', { match: 'not_contains', weight: 2 }),
        sharedFile('statement-excludes-void', 'illable|STATUS\\.VOID|\'void\'', 'src/customers/statement.js'),
        // A void literal in a reader means the rule was copied there instead of shared (invoices/status.js isBillable or the invoice service).
        sharedFile('no-void-literal-in-statement', "STATUS\\.VOID|'void'", 'src/customers/statement.js', { match: 'not_contains', weight: 2 }),
        delivered('segments-void', 'common-design/fix-the-cause'),
        sharedFile('existing-tests-kept', 'a customer with no invoices is standard[\\s\\S]*lifetime spend decides the segment[\\s\\S]*describe counts invoices', 'tests/customers/segments.test.js'),
        shared(never('legacy-not-edited', 'Edit', 'src/legacy')),
      ],
    },
  ];

  // ---------------------------------------------------------------- ts-app-medium-plan: after an accepted plan, with the express packs and CONTRIBUTING.md rules in force
  // Seeded plans 'ap-due' and 'ap-csv' (task-seeds.mjs); jest installed so the checks run. Both plans leave the how of reuse and of the single source of a rule to the implementer.
  const appPlan = { flags: '--ambicode-init --context --install --stack-packs', fixture: 'ts-app-medium-plan', tags: ['app'] };
  const appPlanCases = [
    afterPlan({
      ...appPlan, name: 'task-app-due-after-plan', slug: 'ap-due',
      description: 'Add a stored dueDate to invoices: the plan names validateRange and dueDateFor; a new validator, a bare Error or a copy of the date rule are the failure modes.',
      request: 'Go ahead with the plan.',
      graders: [
        ledger('green-check-recorded', GREEN, T('ap-due')),
        file('due-date-stored', 'dueDate', 'src/invoices/model.js'),
        file('validated-by-shared-range', 'validateRange\\([^)]*dueDate', 'src/invoices/service.js'),
        file('mail-gets-stored-date', 'sendInvoiceCreated\\([^;]*invoice\\.dueDate', 'src/invoices/service.js'),
        file('page-shows-due-date', 'dueDate', 'src/invoices/routes.js'),
        file('test-added', 'dueDate', 'tests/invoices/service.test.js'),
        file('terms-reused', 'dueDateFor\\(', 'src/invoices/service.js'),
        file('no-bare-error', 'throw new Error\\(', 'src/invoices/service.js', { match: 'not_contains' }),
        file('no-own-date-comparison', 'dueDate\\s*[<>]|[<>]\\s*(input\\.)?dueDate|Date\\.parse\\(', 'src/invoices/service.js', { match: 'not_contains' }),
        file('existing-tests-kept', 'total is subtotal plus rounded tax', 'tests/invoices/service.test.js'),
        delivered('ap-due', 'express-errors/classified-errors'),
        ...untouched('legacy', 'src/legacy'),
        ...untouched('installments', 'payments/installments'),
      ],
    }),
    afterPlan({
      ...appPlan, name: 'task-app-csv-after-plan', slug: 'ap-csv',
      description: 'An invoices CSV that must print the invoice page\'s totals: the plan names toDecimal, attachment and the page rule; copying the void-is-zero rule into reports, floating-point money or a fat route are the failure modes.',
      request: 'Go ahead with the plan.',
      graders: [
        ledger('green-check-recorded', GREEN, T('ap-csv')),
        file('csv-writer-added', 'invoicesToCsv', 'src/reports/csv.js'),
        file('grand-total-summed-in-cents', 'invoicesToCsv[\\s\\S]*money\\.sum\\(', 'src/reports/csv.js'),
        file('service-builds-the-file', 'function invoicesCsv\\(', 'src/reports/service.js'),
        file('route-added', '/invoices\\.csv', 'src/invoices/routes.js'),
        file('download-helper-reused', 'attachment\\([^)]*invoicesCsv', 'src/invoices/routes.js'),
        file('no-fat-route', 'invoicesCsv[^\\n]*(\\.map\\(|\\.reduce\\(|toDecimal|money\\.)', 'src/invoices/routes.js', { match: 'not_contains' }),
        file('test-added', 'invoicesToCsv', 'tests/reports/csv.test.js'),
        file('no-float-money', 'toFixed|/ 100', 'src/reports/csv.js', { match: 'not_contains' }),
        file('no-float-money-in-service', 'toFixed|/ 100', 'src/reports/service.js', { match: 'not_contains' }),
        // The page's void-is-zero rule lives in invoices/routes.js; a ternary on VOID in reports is its copy.
        file('no-void-rule-copy-in-reports', 'VOID[^\\n]*\\?\\s*0', 'src/reports/service.js', { match: 'not_contains', weight: 2 }),
        file('existing-tests-kept', 'revenue counts only paid invoices, per issue month', 'tests/reports/service.test.js'),
        delivered('ap-csv', 'common-design/reuse-before-reimplementing'),
        ...untouched('legacy', 'src/legacy'),
      ],
    }),
  ];

  const TUNE = new Set(['task-ts-after-plan', 'task-go-after-investigate', 'task-jvm-after-investigate', 'task-py-bare', 'task-app-reuse-report-helpers', 'task-app-segments-void', 'task-app-refund-multi-file', 'task-app-checks-fail-first', 'task-app-due-after-plan', 'task-app-csv-after-plan']);
  // Files a correct change touches (relevant) and files it may touch without being wrong (allowed), scored on the workspace diff at
  // harvest (context.mjs changedFilesOf), not on what the answer names: the Evals view then shows R/P/F1 of the change itself.
  const CHANGED = {
    'task-ts-after-plan': { relevant: ['src/contexts/lending/application/extend.ts', 'src/contexts/lending/domain/loan.ts', 'test/extend.test.ts'], allowed: ['src/contexts/lending/domain/policy.ts'] },
    'task-py-bare': { relevant: ['src/tidewatch/domain/rules/staleness.py', 'tests/test_staleness.py'], allowed: ['src/tidewatch/domain/errors.py', 'src/tidewatch/domain/rules/limits.py'] },
    'task-go-after-investigate': { relevant: ['internal/tracking/service.go', 'internal/tracking/tracking_test.go'], allowed: ['internal/tracking/history.go', 'internal/core/errors.go'] },
    'task-jvm-after-investigate': { relevant: ['application/src/main/kotlin/org/seedvault/application/usecase/report/ViabilityBands.kt', 'application/src/test/kotlin/org/seedvault/application/usecase/report/ViabilityBandsTest.kt'], allowed: ['application/src/main/kotlin/org/seedvault/domain/lot/Viability.kt'] },
    'task-app-reuse-report-helpers': { relevant: ['src/reports/service.js', 'src/reports/routes.js'], allowed: ['tests/reports/service.test.js', 'tests/reports/routes.test.js', 'tests/factory.js'] },
    'task-app-segments-void': { relevant: ['src/customers/segments.js', 'src/customers/statement.js', 'tests/customers/segments.test.js'], allowed: ['src/invoices/status.js', 'src/invoices/service.js', 'src/reports/top-customers.js', 'tests/customers/statement.test.js', 'tests/factory.js'] },
    'task-app-refund-multi-file': { relevant: ['src/payments/service.js', 'src/payments/repository.js', 'tests/payments/payments.test.js'], allowed: ['tests/factory.js'] },
    'task-app-checks-fail-first': { relevant: ['src/reports/aging.js', 'src/config.js', 'tests/reports/aging.test.js', 'tests/reports/service.test.js'], allowed: [] },
    'task-app-due-after-plan': { relevant: ['src/invoices/model.js', 'src/invoices/service.js', 'src/invoices/routes.js', 'tests/invoices/service.test.js'], allowed: ['tests/invoices/routes.test.js', 'tests/factory.js', 'src/invoices/terms.js', 'src/shared/validation/range.js'] },
    'task-app-csv-after-plan': { relevant: ['src/reports/csv.js', 'src/reports/service.js', 'src/invoices/routes.js', 'tests/reports/csv.test.js'], allowed: ['tests/reports/service.test.js', 'tests/factory.js', 'src/shared/money.js', 'src/shared/http.js', 'src/reports/routes.js', 'src/invoices/service.js', 'tests/reports/routes.test.js', 'tests/invoices/routes.test.js'] },
  };
  return [...lendbox, ...tidewatch, ...parcelhub, ...seedvault, ...kiln, ...appCases, ...appPlanCases].map((c) => (TUNE.has(c.name) ? { ...c, tags: [...c.tags, 'task-tune'], metrics: { source: 'changed', ...CHANGED[c.name] } } : c));
}
