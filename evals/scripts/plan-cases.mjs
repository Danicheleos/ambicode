// The /ambicode:plan cases: ten on the five stack fixtures (two each: one small change, one that crosses layers or projects)
// and five on ts-app-medium (reuse, a legacy decoy, a large feature, a vague request, a draft nobody accepts). cases.mjs spreads
// `planCases`; PLAN_SPECS is also what plan-cases.test.mjs reads, so every file a check names is verified against the fixture.
//
// Both arms are asked for the plan as their answer and graded on the same artefact: the plugin's plan-body.md, the bare arm's
// final message. Checks on the plan's content are shared regexes over that text: files that must or must not appear, never wording.
// `sample` is a line of a good plan that the pattern must match, with real `path:line` anchors the test resolves in the fixture;
// for a `mustNot` entry it is a line the pattern must catch, and `ok` a line it must let through.

/** Command lines a plan must never run: the skill's boundary forbids project scripts, and a bare plan has no reason to. */
const CHECK_COMMANDS = String.raw`(^|"command":"|[;&|]|\n)\s*(npx\s+|node\s+|uv run\s+|python -m\s+)?(npm\s+(test|run)|jest|eslint|vitest|pytest|ruff|go\s+(test|vet|build)|golangci-lint|\.\/gradlew|gradle|cargo\s+(test|clippy|fmt|build|check))\b`;
const ITERATIONS = (count) => Array(count).fill('Goal').join(String.raw`[\s\S]*?`);
const legacyAnchored = String.raw`src/legacy/[\w.-]+:\d|new:\s*src/legacy`;

const both = (a, b) => `${a}[\\s\\S]*${b}|${b}[\\s\\S]*${a}`;

export const PLAN_SPECS = [
  // ---------------------------------------------------------------- stack fixtures
  {
    name: 'plan-ts-grace', slug: 'plan-ts-grace', fixture: 'ts-service-lendbox', size: 'small',
    request: 'Members on the plus tier should get two grace days before a late fee starts to accrue. Basic members keep today\'s rule.',
    description: 'Small change in a bounded-context service: the fee rule and the return flow are in lending, the tier lives in members, and contexts reach each other only through index.ts and the composition root.',
    must: [
      ['late-rule', String.raw`contexts/lending/domain/`, 'src/contexts/lending/domain/fees/late.ts:6 gains the grace days'],
      ['return-flow', String.raw`contexts/lending/application/return\.ts`, 'src/contexts/lending/application/return.ts:13 passes the member tier'],
      ['wired-in-composition', String.raw`src/composition\.ts`, 'src/composition.ts:18 hands lending a way to read the tier'],
      ['fee-test-extended', String.raw`test/[\w-]+\.test\.ts`, 'test/fees.test.ts:3 gets the grace cases'],
    ],
    mustNot: [
      ['no-reach-into-members', String.raw`(import|from|require)[^\n]*members/(domain|application|http)/`, "import { Tier } from '../../members/domain/tier.js'", "import type { Member } from '../../members/index.js'"],
      ['no-unrelated-contexts', String.raw`contexts/(billing|notifications|catalog)/[\w/.-]+\.ts:\d`, 'src/contexts/billing/application/on-loan-returned.ts:6 changes'],
    ],
  },
  {
    name: 'plan-ts-reserve', slug: 'plan-ts-reserve', fixture: 'ts-service-lendbox', size: 'huge',
    request: 'Members should be able to reserve a tool that is out on loan. Reservations queue per tool, first come first served. When the loan comes back the first member in the queue is notified and the tool is held for them for two days; if they do not borrow it by then, the next member is told. A member can cancel a reservation and see their place in the queue.',
    description: 'A feature across contexts: a new queue, the return flow, the borrow flow, notifications, persistence tables and the composition root, under the context-boundary and event-name rules.',
    limits: { max_turns: 45, timeout_seconds: 1500 },
    iterations: 3,
    must: [
      ['return-event-payload', String.raw`application/return\.ts`, 'src/contexts/lending/application/return.ts:14 publishes loanId and feeCents only'],
      ['payload-carries-item', String.raw`payload[^\n]*itemId|itemId[^\n]*payload`, 'the loan-returned payload gains itemId (return.ts:14 has only loanId and feeCents)'],
      ['borrow-honours-hold', String.raw`application/borrow\.ts|isLendable|CatalogApi`, 'src/contexts/lending/application/borrow.ts:10 refuses a tool held for someone else'],
      ['notification-template', String.raw`contexts/notifications/`, 'src/contexts/notifications/application/templates.ts:1 learns the new events'],
      ['tables-and-migration', String.raw`platform/db/(migrations|memory)\.ts`, 'src/platform/db/migrations.ts:1 and src/platform/db/memory.ts:6 gain the reservations table'],
      ['wired-in-composition', String.raw`src/composition\.ts`, 'src/composition.ts:18 wires the new deps and subscribes'],
      ['event-names-follow-rule', String.raw`reservations?\.[a-z]+(-[a-z]+)+|lending\.(reservation|hold)[a-z]*(-[a-z]+)+`, 'publishes reservations.reservation-placed'],
    ],
    mustNot: [
      ['no-cross-context-internals', String.raw`(import|from|require)[^\n]*(lending|catalog|members|notifications|billing)/(domain|application|http|channels)/`, "import { returnItem } from '../../lending/application/return.js'", "import type { Loan } from '../../lending/index.js'"],
      ['billing-untouched', String.raw`contexts/billing/[\w/.-]+\.ts:\d`, 'src/contexts/billing/application/issue-invoice.ts:1 changes'],
    ],
  },
  {
    name: 'plan-py-maxage', slug: 'plan-py-maxage', fixture: 'py-service-tidewatch', size: 'small',
    request: 'The staleness limit is fixed at 45 minutes. Make it configurable through an environment variable, defaulting to 45, so each deployment can set its own.',
    description: 'Small change through the layers of a Python service: the rule is in domain, the settings in infra, the services dataclass in app, and tests build that dataclass by keyword.',
    must: [
      ['rule-takes-limit', String.raw`rules/(staleness|limits)\.py`, 'src/tidewatch/domain/rules/staleness.py:8 takes the limit as a keyword-only argument'],
      ['query-passes-limit', String.raw`app/(queries/latest|services)\.py`, 'src/tidewatch/app/queries/latest.py:12 passes services.max_age'],
      ['settings-and-env', String.raw`config/env\.py`, 'src/tidewatch/infra/config/settings.py:5 and src/tidewatch/infra/config/env.py:6 read TIDEWATCH_MAX_AGE_MINUTES'],
      ['services-and-wiring', String.raw`infra/wiring\.py|app/services\.py`, 'src/tidewatch/app/services.py:9 and src/tidewatch/infra/wiring.py:8 carry the limit'],
      ['fixture-kept-valid', String.raw`tests/conftest\.py`, 'tests/conftest.py:15 builds Services and keeps working'],
      ['test-name-convention', String.raw`test_[a-z]+__[a-z_]+`, 'test_staleness__uses_the_configured_limit in tests/test_staleness.py:16'],
    ],
    mustNot: [
      ['no-unrelated-layers', String.raw`(plugins|api/handlers|cli)/[\w/.-]+\.py:\d`, 'src/tidewatch/cli/main.py:9 changes'],
    ],
  },
  {
    name: 'plan-py-ingest', slug: 'plan-py-ingest', fixture: 'py-service-tidewatch', size: 'huge',
    request: 'Pilot offices should be able to feed a file from one of the existing source adapters (buoy_csv, weir_levels and the rest) into the service, from the command line and through an api handler. A reading above a per-gauge alarm level (default 4800 mm, settable by environment variable) raises an alarm event on the bus, and every alarm is kept in the journal so it can be audited. Readings older than the staleness limit are rejected at ingest with a TW error code.',
    description: 'A feature across all layers of a Python service: command line, api handler, ingest command, domain event and rule, settings, wiring and the journal store, reusing the adapter registry and the freshness rule.',
    limits: { max_turns: 45, timeout_seconds: 1500 },
    iterations: 4,
    must: [
      ['ingest-command', String.raw`app/commands/`, 'src/tidewatch/app/commands/ingest.py:6 checks freshness and alarms'],
      ['adapter-registry-reused', String.raw`plugin_named`, 'plugin_named in src/tidewatch/plugins/registry.py:8 picks the adapter'],
      ['freshness-rule-reused', String.raw`require_fresh`, 'require_fresh in src/tidewatch/domain/rules/staleness.py:8 rejects old readings'],
      ['journal-reused', String.raw`JournalStore|infra/store/journal\.py`, 'JournalStore in src/tidewatch/infra/store/journal.py:5 records the alarms'],
      ['alarm-event', String.raw`domain/events/`, 'src/tidewatch/domain/events/readings.py:7 gets a LevelAlarm event'],
      ['handler-per-endpoint', String.raw`api/handlers/[a-z_]+\.py`, 'new: src/tidewatch/api/handlers/ingest.py ingest_feed'],
      ['cli-entry', String.raw`cli/main\.py`, 'src/tidewatch/cli/main.py:9 takes an ingest subcommand'],
      ['settings-wiring', both(String.raw`infra/config/(settings|env)\.py`, String.raw`infra/wiring\.py`), 'src/tidewatch/infra/config/settings.py:5 and src/tidewatch/infra/wiring.py:8 carry the alarm level and subscribe'],
    ],
    mustNot: [
      ['no-new-adapter', String.raw`new:\s*src/tidewatch/plugins`, 'new: src/tidewatch/plugins/sources/pilot_file/plugin.py PLUGIN'],
    ],
  },
  {
    name: 'plan-go-price', slug: 'plan-go-price', fixture: 'go-module-parcelhub', size: 'small',
    request: 'Expose the price of a parcel over HTTP: GET /parcels/<tag>/price returns the price in cents. A parcel too heavy for any rate band must get a clear client error, not a 500.',
    description: 'Small change in a Go service: the handler mounts everything under /parcels/ and trims that prefix, pricing already exists, and the too-heavy case surfaces as core.ErrInvalid.',
    must: [
      ['handler-added', String.raw`internal/httpapi/\w+\.go`, 'internal/httpapi/parcels.go:13 gets a price handler'],
      ['route-dispatch', String.raw`internal/httpapi/server\.go|HandleFunc|[Mm]ux|\{tag\}|[Ss]uffix|PathValue`, 'internal/httpapi/server.go:20 sends a /price suffix to it'],
      ['pricing-reused', String.raw`pricing\.Quote`, 'pricing.Quote (internal/pricing/price.go:10) quotes the parcel'],
      ['invalid-is-client-error', String.raw`ErrInvalid`, 'errors.Is(err, core.ErrInvalid) becomes a 422 (internal/core/errors.go:7)'],
      ['trim-prefix-noticed', String.raw`HasSuffix|strings\.(Cut|Split|SplitN)|[Ss]uffix|\{tag\}|PathValue`, 'internal/httpapi/parcels.go:14 trims /parcels/, so the tag would be PH-1/price: dispatch on the suffix'],
      ['server-test', String.raw`\w+_test\.go`, 'internal/httpapi/server_test.go:19 gets price cases'],
    ],
    mustNot: [
      ['no-cli-change', String.raw`cmd/parcelctl/[\w.]+\.go:\d`, 'cmd/parcelctl/main.go:12 changes'],
    ],
  },
  {
    name: 'plan-go-scans', slug: 'plan-go-scans', fixture: 'go-module-parcelhub', size: 'huge',
    request: 'Handheld scanners should report scans over HTTP: POST /parcels/<tag>/scans with a scanner line such as "PH-1042 DEP". Only forward moves are allowed (collected, at-depot, on-van, delivered); anything else is a 409. A parcel reaching the depot gets its bay assigned, every accepted scan notifies the customer and is recorded in the audit trail. A returned parcel (refused, damaged, wrong-address) goes back to the depot through the returns flow, also from the command line as `parcelctl return <tag> <reason>`.',
    description: 'A feature across a Go module: http handler, tracking service, a new sentinel error, scanner parsing, depot, notify, audit and returns, wired in two commands, under the error-wrapping and injected-clock rules.',
    limits: { max_turns: 45, timeout_seconds: 1500 },
    iterations: 4,
    must: [
      ['scanner-parse-reused', String.raw`scanner\.Parse`, 'scanner.Parse (internal/scanner/parse.go:11) reads the line'],
      ['transition-rule-in-tracking', String.raw`internal/tracking/`, 'internal/tracking/service.go:28 refuses a backward move'],
      ['conflict-sentinel', String.raw`internal/core/|ErrConflict`, 'internal/core/errors.go:7 gets ErrConflict'],
      ['depot-assign-reused', String.raw`Assign\(|internal/depot/planner\.go`, 'Planner.Assign (internal/depot/planner.go:15) picks the bay'],
      ['returns-reused', String.raw`returns\.Start`, 'returns.Start (internal/returns/flow.go:10) moves it back to the depot'],
      ['core-ports-reused', both(String.raw`core\.Notifier|notify\.Console`, String.raw`core\.Auditor|audit\.Log`), 'core.Notifier (internal/notify/console.go:14) and core.Auditor (internal/core/interfaces.go:24)'],
      ['daemon-wired', String.raw`cmd/parceld/`, 'cmd/parceld/routes.go:13 builds the server with notifier and auditor'],
      ['ctl-return-command', String.raw`cmd/parcelctl/`, 'cmd/parcelctl/flags.go:14 parses return <tag> <reason>'],
    ],
    mustNot: [],
  },
  {
    name: 'plan-jvm-bands', slug: 'plan-jvm-bands', fixture: 'jvm-gradle-seedvault', size: 'small',
    request: 'The stock report should show how many lots are excellent, viable and weak, next to the viable count, in the REST report and in the CLI report table.',
    description: 'Small change in a hexagonal Kotlin service: the banding helper exists unused in application, the report type is in the input port, and the REST json helper cannot carry a nested map.',
    must: [
      ['banding-reused', String.raw`viabilityBands`, 'viabilityBands (application/src/main/kotlin/org/seedvault/application/usecase/report/ViabilityBands.kt:5) already counts the bands'],
      ['report-type-and-service', String.raw`StockReport`, 'application/src/main/kotlin/org/seedvault/application/port/input/ReportStock.kt:3 and usecase/report/StockReportService.kt:10'],
      ['rest-route', String.raw`ReportRoutes\.kt|adapters/rest`, 'adapters/rest/src/main/kotlin/org/seedvault/adapters/rest/routes/ReportRoutes.kt:9 prints the bands'],
      ['cli-command', String.raw`ReportCommand\.kt|adapters/cli`, 'adapters/cli/src/main/kotlin/org/seedvault/adapters/cli/commands/ReportCommand.kt:9 adds rows'],
      ['json-helper-noticed', String.raw`Json\.kt|server/Json|[Ff]latten|nested|[Mm]ap[^\n]*(string|quote|toString)`, 'json() in adapters/rest/src/main/kotlin/org/seedvault/adapters/rest/server/Json.kt:3 quotes a map as a string, so the bands are flattened'],
    ],
    mustNot: [
      ['no-wiring-change', String.raw`bootstrap/[\w/.-]+\.kt:\d`, 'bootstrap/src/main/kotlin/org/seedvault/bootstrap/Wiring.kt:28 changes'],
      ['no-adapters-outside-report', String.raw`adapters/(persistence|messaging)/[\w/.-]+\.kt:\d`, 'adapters/persistence/src/main/kotlin/org/seedvault/adapters/persistence/file/LotCodec.kt:13 changes'],
    ],
  },
  {
    name: 'plan-jvm-chill', slug: 'plan-jvm-chill', fixture: 'jvm-gradle-seedvault', size: 'huge',
    request: 'Seeds of species with dormancy must be chilled before they can be sown. Add a chill step: a banked lot is marked as chilled on a date; sowing is rejected until the species\' chill days have passed since that date; the chill date survives a restart; the desk is mailed when a lot is chilled, as it is for sowing; and chilling is available over REST and from the CLI.',
    description: 'A feature across all seven Gradle subprojects: domain rule and field, a new event the exhaustive topic mapping must cover, the file codec, use case and input port, mail, REST, CLI and the bootstrap wiring, under the Outcome.Rejected and value-class rules.',
    limits: { max_turns: 45, timeout_seconds: 1500 },
    iterations: 4,
    must: [
      ['rule-in-domain', String.raw`GerminationRules\.kt|SowLotService\.kt`, 'domain/src/main/kotlin/org/seedvault/domain/germination/GerminationRules.kt:11 checks the chill days'],
      ['chill-days-reused', String.raw`chillDays`, 'Dormancy.chillDays (domain/src/main/kotlin/org/seedvault/domain/species/Dormancy.kt:3) is the requirement'],
      ['species-catalog-reused', String.raw`SpeciesCatalog`, 'SowLotService.kt:17 gets the SpeciesCatalog port'],
      ['lot-and-codec', String.raw`file/LotCodec\.kt`, 'lot/SeedLot.kt:8 and file/LotCodec.kt:13 carry chilledOn'],
      ['topic-mapping', String.raw`bus/Topic\.kt`, 'adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/bus/Topic.kt:8 maps LotChilled'],
      ['event-defined', String.raw`domain/events/`, 'domain/src/main/kotlin/org/seedvault/domain/events/GerminationEvents.kt:6 gets LotChilled'],
      ['rest-and-cli', both(String.raw`adapters/rest`, String.raw`adapters/cli`), 'adapters/rest routes/GerminationRoutes.kt:13 and adapters/cli commands/SowCommand.kt:8'],
      ['wiring-and-main', both(String.raw`bootstrap/[\w/.-]*Wiring\.kt`, String.raw`bootstrap/[\w/.-]*Main\.kt`), 'bootstrap/src/main/kotlin/org/seedvault/bootstrap/Wiring.kt:28 and bootstrap/src/main/kotlin/org/seedvault/bootstrap/Main.kt:17'],
      ['expected-failures-are-outcomes', String.raw`Outcome\.Rejected`, 'a lot still chilling returns Outcome.Rejected'],
    ],
    mustNot: [],
  },
  {
    name: 'plan-mono-degrees', slug: 'plan-mono-degrees', fixture: 'monorepo-rust-ts-kiln', size: 'small',
    request: 'On the firing page, show each segment\'s target temperature in degrees Celsius, not in tenths.',
    description: 'Small change in a monorepo: one dashboard view prints a raw _dc value, a formatter for the display edge already exists, and engine, tools, generated and vendored code are out of scope.',
    must: [
      ['view-edited', String.raw`dashboard/src/views/firing\.ts`, 'dashboard/src/views/firing.ts:6 prints formatDc(s.targetDc)'],
      ['formatter-reused', String.raw`formatDc`, 'formatDc (dashboard/src/lib/format/temperature.ts:3) is the display edge'],
    ],
    mustNot: [
      ['no-second-formatter', String.raw`new:\s*dashboard/src/lib/format/`, 'new: dashboard/src/lib/format/celsius.ts toCelsius'],
      ['no-other-projects', String.raw`(engine|tools|vendor)/[\w/.-]+\.(rs|py|js|ts|toml):\d|__generated__/[\w.-]+:\d`, 'engine/crates/units/src/temperature.rs:2 changes'],
    ],
  },
  {
    name: 'plan-mono-calibrate', slug: 'plan-mono-calibrate', fixture: 'monorepo-rust-ts-kiln', size: 'huge',
    request: 'Apply thermocouple calibration offsets end to end. The Python tool already fits an offset per kiln. The engine should apply a per-kiln offset to thermocouple readings, the dashboard should have an endpoint on the kilns API that validates an offset and passes it to the engine, show it on the kiln page, and the tool should write the offsets as JSON the dashboard can post.',
    description: 'A feature across Rust, TypeScript and Python in one repository: protocol message, thermocouple driver, safety limit, dashboard route, client, validation and view, tool export, under the _dc unit convention and the generated-code rule; the engine has no HTTP surface yet.',
    limits: { max_turns: 45, timeout_seconds: 1500 },
    iterations: 4,
    must: [
      ['engine-protocol', String.raw`engine/crates/protocol/`, 'engine/crates/protocol/src/message.rs:2 gets Calibrate { kiln, offset_dc }'],
      ['engine-driver', String.raw`engine/crates/(controller|sim)/`, 'engine/crates/controller/src/drivers/thermocouple.rs:4 applies the offset'],
      ['dashboard-route', String.raw`dashboard/src/routes/`, 'dashboard/src/routes/kilns.routes.ts:4 registers the offset endpoint'],
      ['dashboard-client', String.raw`dashboard/src/(lib/engine|services)/`, 'dashboard/src/lib/engine/client.ts:6 sends it to the engine'],
      ['tool-export', String.raw`tools/src/kilnlab/`, 'tools/src/kilnlab/export/json_out.py:4 writes the posted shape'],
      ['dc-names-in-each-language', both('offset_dc', '(offsetDc|OFFSET_DC)'), 'offset_dc in Rust and Python, offsetDc and MAX_OFFSET_DC in TypeScript'],
      ['engine-http-gap-noticed', String.raw`openapi|no (HTTP|http|REST)[^\n]{0,40}(server|endpoint|layer|surface)|(does not|doesn't|has no|there is no)[^\n]{0,40}(HTTP|http)`, 'the engine has no HTTP surface and engine/openapi.yaml is absent: assumed'],
    ],
    mustNot: [
      ['generated-and-vendored-untouched', String.raw`__generated__/[\w.-]+:\d|new:[^\n]*__generated__|vendor/[\w/.-]+:\d`, 'dashboard/src/__generated__/engine-api.ts:2 gets a new path', 'regenerate the client instead of editing dashboard/src/__generated__'],
    ],
  },

  // ---------------------------------------------------------------- ts-app-medium
  {
    name: 'plan-app-reuse', slug: 'plan-app-overdue', fixture: 'ts-app-medium', size: 'narrow',
    request: 'Add a due date to invoices: an invoice carries a dueDate, creating one with a dueDate before its issue date is rejected, and there is a report of the overdue invoices with the amount still outstanding on each.',
    description: 'A feature the shared validators, the money helpers and the reports module already carry; a frozen legacy copy and a payment-plan dueDate are decoys.',
    must: [
      ['validators-reused', String.raw`validateRange|validateDate|shared/validation`, 'validateRange (src/shared/validation/range.js:4) with min: issuedAt'],
      ['invoice-files-extended', String.raw`src/invoices/`, 'src/invoices/model.js:3 and src/invoices/service.js:59'],
      ['outstanding-reused', String.raw`outstanding\(|invoices?\.outstanding|unpaidInvoices`, 'invoices.outstanding (src/invoices/service.js:63) gives the amount still owed'],
      ['reports-module-extended', String.raw`src/reports/`, 'src/reports/service.js:34 gets overdueInvoices'],
      ['factory-used-in-tests', String.raw`tests/factory\.js`, 'tests/factory.js:21 makeInvoice takes dueDate'],
    ],
    mustNot: [
      ['no-parallel-validator', String.raw`new:\s*src/shared/(validation|dates?)/`, 'new: src/shared/validation/due-date.js validateDueDate'],
      ['legacy-untouched', legacyAnchored, 'src/legacy/invoice-total.js:4 is reused'],
    ],
    llm: ['no-decoy-due-date', `
The plan is for adding a due date to invoices (a new field) and an overdue report.
PASS only if all hold:
- It does not treat the dueDate of src/payments/installments.js, which belongs to a payment-plan installment, as an existing invoice due date, and does not plan to reuse addMonths or schedule for invoices.
- Overdue is computed from the invoice's new dueDate and the as-of day, not from issuedAt plus a hard-coded number of days.
FAIL otherwise.`],
  },
  {
    name: 'plan-app-csv', slug: 'plan-app-csv', fixture: 'ts-app-medium', size: 'narrow',
    request: 'Finance wants a CSV download of the invoices: one line per invoice with id, customer id, status and the total, and a grand total line at the end. The amounts must match what the invoice page shows.',
    description: 'A frozen legacy CSV export with floating-point totals sits beside a reports CSV writer and an invoice summary read model; the plan must build on the live ones and leave legacy alone.',
    must: [
      ['summary-model-reused', String.raw`invoices/summary\.js|summarize`, 'summarize (src/invoices/summary.js:6) has every number the invoice page shows, in cents'],
      ['csv-writer-reused', String.raw`reports/csv\.js|toCsv`, 'src/reports/csv.js:6 toCsv and its cell escaping'],
      ['money-helper', String.raw`shared/money|money\.(sum|format)`, 'the grand total uses money.sum (src/shared/money.js)'],
      ['route-added', String.raw`src/(reports|invoices)/routes\.js`, 'src/reports/routes.js:14 gets a GET route for the invoice CSV'],
      ['tests-next-to-module', String.raw`tests/(reports|invoices)/`, 'tests/reports/csv.test.js gets invoice rows'],
    ],
    mustNot: [
      ['legacy-untouched', legacyAnchored, 'src/legacy/invoice-export.js:5 exportCsv is reused'],
    ],
  },
  {
    name: 'plan-app-remind', slug: 'plan-app-remind', fixture: 'ts-app-medium', size: 'narrow',
    request: 'Send customers an email reminder when an invoice is overdue. Invoices have no due date today, so they need one. A reminder goes out at most once a day while the invoice is unpaid and past due. Customers can opt out of reminders separately from receipts. It ships switched off.',
    description: 'A large multi-step feature: due date, opt-out, template, delivery and a once-a-day record, with a feature flag that already exists unused and a frozen legacy mail as decoy.',
    limits: { max_turns: 40, timeout_seconds: 1200 },
    iterations: 3,
    must: [
      ['existing-flag-reused', String.raw`overdueReminders`, 'the overdueReminders flag (src/flags.js:5) already exists and is off'],
      ['due-date-on-invoice', String.raw`src/invoices/`, 'src/invoices/model.js:3 carries dueDate'],
      ['opt-out-on-customer', String.raw`src/customers/`, 'src/customers/service.js:34 contactFor returns the reminders preference like receipts'],
      ['template-added', String.raw`notifications/templates\.js|template`, 'src/notifications/templates.js:3 gets overdueReminder'],
      ['delivery-reused', String.raw`notifications/service\.js|deliver\(`, 'deliver (src/notifications/service.js:10) sends it and keeps the record'],
      ['once-a-day-record', String.raw`forCustomer|notifications/repository\.js`, 'forCustomer (src/notifications/repository.js:7) shows whether one went out today'],
      ['factory-used-in-tests', String.raw`tests/factory\.js`, 'tests/factory.js:21 makeInvoice takes dueDate'],
    ],
    mustNot: [
      ['legacy-untouched', legacyAnchored, 'src/legacy/payment-hooks.js:5 is extended'],
    ],
  },
  {
    name: 'plan-app-vague', slug: 'plan-app-vague', fixture: 'ts-app-medium', size: 'narrow',
    request: 'Late payers are a mess for us. Make the billing service handle them better.',
    description: 'A vague request: the repository has no invoice due date, an aging report by issue date and a reminders flag that is off; the plan has to ground itself in that and say what it assumed.',
    must: [
      ['no-due-date-noticed', String.raw`(no|not|without|lacks?|missing|has none|does not (have|carry|store)|doesn't)[^\n]{0,60}([Dd]ue ?[Dd]ate|dueDate)`, 'invoices carry no dueDate today (src/invoices/model.js:3)'],
      ['existing-pieces-found', String.raw`overdueReminders|reports/aging\.js|bucketFor`, 'the aging report buckets by issue date (src/reports/aging.js:5) and overdueReminders (src/flags.js:5) is off'],
      ['assumptions-stated', String.raw`[Aa]ssum|[Oo]pen decision`, 'Assumptions: late payers means unpaid invoices past a due date'],
    ],
    mustNot: [
      ['legacy-untouched', legacyAnchored, 'src/legacy/invoice-total.js:4 is reused'],
    ],
    llm: ['scope-grounded', `
The request is vague: "Late payers are a mess for us. Make the billing service handle them better."
PASS only if all hold:
- The plan states at least one explicit assumption about what "handle late payers better" means (for example reminders, a due date, an overdue report, a late fee) and says what it left out or leaves as an open decision.
- Every iteration serves the reading it states; none adds an unrelated feature.
FAIL otherwise.`],
  },
  {
    name: 'plan-app-draft', slug: 'plan-app-draft', fixture: 'ts-app-medium', size: 'narrow', draft: true,
    request: 'Send the customer an email when a payment is refunded. Today the refund handler only logs it.',
    description: 'No gate answer is given: the plan stays a draft, the gate is printed, nothing is promoted, and the closing message must not call the plan accepted.',
    must: [
      ['refund-handler-extended', String.raw`src/notifications/`, 'src/notifications/handlers.js:25 onPaymentRefunded sends the mail'],
      ['template-added', String.raw`notifications/templates\.js|template`, 'src/notifications/templates.js:3 gets paymentRefund'],
      ['flag-and-preference-kept', String.raw`receiptEmails|receipts`, 'it keeps the receiptEmails flag and the customer receipts preference as onPaymentReceived does'],
      ['handler-tests-extended', String.raw`tests/notifications/`, 'tests/notifications/handlers.test.js:11 gets refund cases'],
    ],
    mustNot: [],
  },
];

/** The text a good plan for `spec` would hold: every positive sample, plus enough `Goal` headings for its iterations. */
export const goodPlan = (spec) => [...spec.must.map(([, , sample]) => sample), ...Array(spec.iterations ?? 1).fill('Goal: one iteration')].join('\n');

export function planCases({ regex, ledger, tool, never, exists, llm, shared, DONE }) {
  // A promoted plan is renamed to plan.md. closeRoute removes steps/ at every route exit (run-context.ts), so a draft nobody
  // accepted survives only as plan-draft_<timestamp>.md: no literal path, hence the draft case checks it by glob and not by content.
  const body = (slug) => `repo/.ambicode/tasks/${slug}/plan.md`;
  const T = (slug) => `repo/.ambicode/tasks/${slug}/ledger.jsonl`;
  const REPO = 'The repository is at `repo/`.';
  // Source and test directories of every fixture; the plan route itself writes only below .ambicode/.
  const WRITE_SOURCE = String.raw`"file_path":"[^"]*/(src|tests?|internal|cmd|engine|dashboard|tools|domain|application|adapters|bootstrap)/`;

  return PLAN_SPECS.map((spec) => {
    const { slug } = spec;
    const at = body(slug);
    const planText = (name, pattern, match = 'contains', weight = 1) => shared(regex(name, pattern, { file: at, match, weight }), regex(name, pattern, { match, weight }));
    const content = [
      ...spec.must.map(([name, pattern]) => planText(name, pattern)),
      ...spec.mustNot.map(([name, pattern]) => planText(name, pattern, 'not_contains')),
      ...(spec.llm ? [shared(llm(spec.llm[0], spec.llm[1], { file: at }), llm(spec.llm[0], spec.llm[1]))] : []),
    ];
    const boundary = [
      shared(never('no-edit', 'Edit', '.')),
      shared(never('no-write-source', 'Write', WRITE_SOURCE)),
      shared(never('no-checks-run', 'Bash', CHECK_COMMANDS)),
    ];
    const asked = `/ambicode:plan --task ${slug}`;
    const flags = '--ambicode-init --context';
    const base = { name: spec.name, description: spec.description, tags: ['plan', spec.size], version: 1, fixture: spec.fixture, flags, ...(spec.limits ? { limits: spec.limits } : {}) };

    if (spec.draft) {
      return {
        ...base,
        tags: ['plan', 'gate'],
        prompt: `${asked} ${spec.request} ${REPO}`,
        bare: null,
        graders: [
          exists('plan-draft-saved', `repo/.ambicode/tasks/${slug}/plan-draft_*.md`),
          ledger('accept-gate-printed', '"kind":"gate","gate":"plan-accept"', T(slug)),
          ledger('not-promoted', '"note":"plan"', T(slug), { match: 'not_contains' }),
          ledger('anchors-valid', '"worker":"plan-check"(?![^\\n]*"uncoded")[^\\n]*"anchorsBad":0', T(slug)),
          ...boundary,
          regex('draft-stated', String.raw`[Dd]raft`),
          regex('not-called-accepted', String.raw`(is|was|been|now|as) (accepted|approved|final)|implementation (can|may) (start|begin)`, { match: 'not_contains' }),
        ],
      };
    }

    const request = spec.request;
    const iterationGraders = spec.iterations ? [regex(`${spec.iterations}-iterations`, ITERATIONS(spec.iterations), { file: at })] : [];
    return {
      ...base,
      prompt: `${asked} --headless --answer plan-accept=Accept ${request} ${REPO}`,
      bare: `Write an implementation plan for this change, in iterations that can each be reviewed alone, and give the plan as your answer; do not implement it. If something is unclear, state your assumptions. ${request} ${REPO}`,
      graders: [
        exists('plan-written', at),
        regex('five-fields', 'Goal[\\s\\S]*Changes[\\s\\S]*Accept[\\s\\S]*Checks[\\s\\S]*Leaves out', { file: at }),
        ledger('anchors-valid', '"worker":"plan-check"(?![^\\n]*"uncoded")[^\\n]*"anchorsBad":0', T(slug)),
        DONE(T(slug)),
        ...iterationGraders,
        ...content,
        ...boundary,
      ],
    };
  });
}
