// The /ambicode:plan cases: ten on the five stack fixtures (two each: one small change, one that crosses layers or projects)
// and five on ts-app-medium-plan (reuse, a legacy decoy, a large feature, a vague request, a draft nobody accepts). cases.mjs spreads
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
// One line of the plan, in plain text and in the JSON of a Write call, where a line break is the two characters \n.
const LINE = String.raw`(?:(?!\\n)[^\n])`;
// A line that rules a thing out ("never toFixed", "the legacy export uses toFixed", "unrelated") is not a line that plans it.
const NEGATION = String.raw`\b([Nn]ot?|[Nn]ever|[Nn]one|[Nn]othing|[Ww]ithout|[Ii]nstead|[Rr]ather|[Aa]void\w*|[Uu]nrelated|[Dd]ecoy|[Ff]rozen|[Ll]egacy|[Ii]gnor\w*|[Ff]orbid\w*|[Uu]nchanged|[Uu]ntouched|[Cc]annot)\b|n't\b`;
/** A `mustNot` pattern that flags `pattern` only on a line with no negation (or `alsoFine`) in it. */
const planned = (pattern, alsoFine = null) => String.raw`(^|\n|\\n)(?!${LINE}*(${NEGATION}${alsoFine === null ? '' : `|${alsoFine}`}))${LINE}*(${pattern})`;
// CONTRIBUTING.md of the app fixture, as checks on the plan text.
const BARE_ERROR = planned(String.raw`\bnew Error\(`);
// An acceptance line that states the expected value ("equals totalCents / 100 as a decimal", the v3 csv plan) computes nothing.
const FLOAT_MONEY = planned(String.raw`toFixed\(|parseFloat\(|\/ ?100\b`, 'as a decimal');
// "using the factory" counts: the plugin remind and bare reuse plans of the v2 run said only that and failed.
const FACTORY = String.raw`tests/factory\.js|make(Invoice|Customer|Payment)\(|\b[Ff]actory\b`;
// The app plan variant's existing due-date mechanism and Finance's definition of overdue (src/invoices/terms.js, src/config.js).
// Not paymentTermsDays: a plan that never opened terms.js invents that name (the bare remind plan of 2026-10-23 did).
const TERMS = String.raw`dueDateFor|terms\.js`;
const GRACE = String.raw`overdueGraceDays`;
// A line that puts invoice reads in a notifications file or the notifications feature (the bare remind plan of 2026-10-23:
// "put it in the notifications feature and call `invoices/service`"). A line where notifications is the callee passes.
const INVOICE_READ = String.raw`invoices/(service|repository)|invoices\.(list|get|outstanding|all\w*)\(|reports/repository|require\([^)\n]*invoices`;
const NOTIFICATIONS_READ_INVOICES = `(notifications/[\\w-]+\\.js|notifications (feature|module|folder|directory))${LINE}{0,160}(${INVOICE_READ})`;
// Checks that need two facts joined, not one name found (each v2 plan found every name and still missed these):
// Finance's day is clock.businessDay (docs/architecture.md, Days); every v2 plan counted overdue in clock.today().
const BUSINESS_DAY = String.raw`businessDay|Europe/Berlin|config\.timeZone`;
// A validator name that src/shared/validation does not export yet.
const NEW_VALIDATOR = String.raw`\bvalidate(?!(Range|Date|Cents|Email|Id|Required|String|Boolean)\b)\w+`;
// The due date kept on the invoice at create: the back office can change a customer's terms later (customers/patch.js), so a
// day derived again from the terms is not the day the mail printed. All four v2 remind and vague plans derived it.
const DUE_DAY = String.raw`(dueDate|[Dd]ue ?[Dd]ate|[Dd]ue day|pay-by day)\b`;
const DUE_STORED = planned(String.raw`\b(stor|persist)\w*${LINE}{0,80}${DUE_DAY}|${DUE_DAY}${LINE}{0,80}(\b(stor|persist)\w*|on the invoice(?! mail)|createInvoice|invoices/model)|(createInvoice|invoices/model\.js)${LINE}{0,120}dueDate\b`);

/**
 * A `mustNot` pattern that flags `pattern` only where the plan proposes changing that file: a bullet that opens with the path (the
 * Changes entries) or a line with a change verb before it. A file cited as the pattern to mirror or as a fact ("Style follows
 * billing/on-loan-returned.ts:6-9", the 2026-10-23 ts-grace and ts-reserve plans) is not planned work, nor is anything under a
 * findings heading ("What the code lacks or already settles", Assumptions, Open decisions) until the next Iteration heading (the
 * mono-calibrate bullet "__generated__/engine-api.ts:1 says it is generated ... not edited by hand").
 */
const FINDINGS_SECTION = String.raw`(?<=(?:^|\n)#+ *(?:What the code|Findings|Assumptions|Open decisions)[^\n]*\n(?:(?!#+ *Iteration)[\s\S])*)`;
const changes = (pattern) => String.raw`(^|\n|\\n)(?!${FINDINGS_SECTION})(?:${LINE}*?\b(?:add|change|edit|modify|update|extend|replace|rewrite|touch|move|rename|delete|regenerate)(?:s|d|es|ed|ing)?\b${LINE}*?(?:${pattern})|\s*(?:[-*]|\d+[.)]|\|)\s*[*_\x60]*[\w/.-]*?(?:${pattern}))`;

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
      ['no-unrelated-contexts', changes(String.raw`contexts/(billing|notifications|catalog)/[\w/.-]+\.ts:\d`), '- `src/contexts/billing/application/on-loan-returned.ts:6` changes', 'Mirror the existing pattern (`CatalogApi`, `src/contexts/catalog/index.ts:8-10`, consumed in lending)'],
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
      ['billing-untouched', changes(String.raw`contexts/billing/[\w/.-]+\.ts:\d`), '- `src/contexts/billing/application/issue-invoice.ts:1` changes', '- `src/contexts/lending/application/return.ts:13`: the handler. Style follows `src/contexts/billing/application/on-loan-returned.ts:6-9`.'],
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
      ['no-unrelated-layers', changes(String.raw`(plugins|api/handlers|cli)/[\w/.-]+\.py:\d`), '- `src/tidewatch/cli/main.py:9` changes', '`settings_from_env` is the single place that reads the environment (`src/tidewatch/cli/main.py:10` is its only caller).'],
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
      ['no-other-projects', changes(String.raw`(?<![\w/.-])(engine|tools|vendor)/[\w/.-]+\.(rs|py|js|ts|toml):\d|__generated__/[\w.-]+:\d`), '- `engine/crates/units/src/temperature.rs:2` changes', 'the view is that edge, so `Firing.targetDc` (`dashboard/src/lib/engine/types.ts:3`) stays in tenths'],
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
      ['generated-and-vendored-untouched', changes(String.raw`__generated__/[\w.-]+:\d|new:[^\n]*__generated__|vendor/[\w/.-]+:\d`), '- `dashboard/src/__generated__/engine-api.ts:2` gets a new path', 'regenerate the client instead of editing dashboard/src/__generated__'],
    ],
  },

  // ---------------------------------------------------------------- ts-app-medium-plan
  // The app cases run on the plan variant (APP_PLAN in fixtures/app-medium.mjs): payment terms that print a pay-by day nobody
  // stores and the back office can change per customer, Finance's overdue grace and time zone, a PATCH whitelist, an invoice
  // page view, CSV download helpers, a gateway cache on /reports, a refund event with no customerId and a test that keeps
  // src/notifications from requiring invoices. `policy-` checks grade CONTRIBUTING.md.
  // Weights: 3 for a check that needs two facts joined, 2 for an existing mechanism to find, 1 for the rest. The v2 run
  // passed every weight-1 check in all nine plans, so they only set the floor.
  {
    name: 'plan-app-reuse', slug: 'plan-app-overdue', fixture: 'ts-app-medium-plan', size: 'narrow', version: 4,
    weights: { 'policy-validation-shared': 3, 'page-shows-due-date': 3, 'no-parallel-validator': 2, 'business-day': 2, 'terms-reused': 2, 'invoice-mail-follows': 2, 'grace-days-honoured': 2 },
    request: 'Add a due date to invoices: an invoice carries a dueDate, creating one with a dueDate before its issue date is rejected, and there is a report of the overdue invoices with the amount still outstanding on each.',
    description: 'A feature the repository half has: payment terms already compute a pay-by day for the invoice mail, config holds the overdue grace, validateRange compares days, the invoice page is a view that drops unknown fields and days count in Finance\'s zone; a payment-plan dueDate and a legacy total are decoys.',
    must: [
      ['policy-validation-shared', String.raw`validateRange`, 'validateRange (src/shared/validation/range.js:4) with { min: issuedAt } rejects an earlier dueDate'],
      ['terms-reused', TERMS, "the default is dueDateFor(issuedAt, customer.paymentTermsDays) (src/invoices/terms.js:6), the day the mail already promises"],
      ['invoice-mail-follows', String.raw`sendInvoiceCreated|invoiceCreated|payableBy|notifications/(service|templates)\.js|(mail|line 41|service\.js:41)${LINE}{0,100}(stored|invoice\.dueDate)|(stored|invoice\.dueDate)${LINE}{0,100}mail`, 'src/invoices/service.js:41 passes the stored dueDate to sendInvoiceCreated instead of recomputing it'],
      // The invoice page (src/invoices/routes.js view) lists its fields: a dueDate on the record alone never reaches it.
      ['page-shows-due-date', planned(String.raw`\bview\b|invoices/routes\.js|\bpage\b${LINE}{0,80}dueDate\b|dueDate\b${LINE}{0,80}\bpage\b`), 'view (src/invoices/routes.js:8) gains dueDate so the invoice page shows it'],
      ['grace-days-honoured', GRACE, 'overdue means dueDate plus config.overdueGraceDays (src/config.js:9) is before the as-of day'],
      ['business-day', BUSINESS_DAY, 'the as-of day defaults to clock.businessDay() (src/shared/clock.js:9), Finance\'s day'],
      ['outstanding-reused', String.raw`outstanding\(|invoices?\.outstanding|unpaidInvoices|outstandingCents`, 'invoices.outstanding (src/invoices/service.js:64) gives the amount still owed'],
      ['policy-test-factory', FACTORY, 'tests/factory.js:21 makeInvoice takes dueDate'],
      ['policy-tests-next-to-module', String.raw`tests/(invoices|reports)/[\w-]+\.test\.js`, 'tests/invoices/service.test.js and tests/reports/service.test.js get the cases'],
    ],
    mustNot: [
      // Also a validator added to an existing shared/validation file with no `new:` (the v3 bare plan: "`src/shared/validation/date.js`
      // and `index.js`: add `validateDateNotBefore(`"); calling an existing one is fine.
      ['no-parallel-validator', String.raw`new:\s*(src/)?shared/(validation/|dates?\b)|shared/validation${LINE}{0,120}\badd\w*${LINE}{0,40}${NEW_VALIDATOR}|\badd\w*${LINE}{0,40}${NEW_VALIDATOR}${LINE}{0,80}shared/validation`,
        'src/shared/validation/date.js and index.js: add `validateDateNotBefore(value, notBefore, field)`',
        'src/invoices/service.js: add validateRange(dueDate, { min: issuedAt }) from src/shared/validation/range.js:4'],
      ['no-decoy-due-date', planned(String.raw`addMonths|nextDue|installments\.js:\d`), 'src/payments/installments.js:5 addMonths gives the due day', 'the dueDate of src/payments/installments.js:1 belongs to payment plans and is unrelated'],
      ['legacy-untouched', legacyAnchored, 'src/legacy/invoice-total.js:4 is reused'],
      ['policy-no-bare-error', BARE_ERROR, "src/invoices/service.js:27 throws new Error('dueDate before issuedAt')", 'never throw new Error; validateRange throws a ValidationError'],
      ['policy-no-float-money', FLOAT_MONEY, 'the report prints (outstandingCents / 100).toFixed(2)', 'amounts stay in cents, no toFixed'],
    ],
  },
  {
    name: 'plan-app-csv', slug: 'plan-app-csv', fixture: 'ts-app-medium-plan', size: 'narrow', version: 4,
    weights: { 'served-live': 3, 'page-total-used': 3, 'decimal-helper-reused': 2, 'download-helper-reused': 2 },
    request: 'Finance wants a CSV download of the invoices: one line per invoice with id, customer id, status and the total, and a grand total line at the end. The amounts must match what the invoice page shows.',
    description: 'A revenue CSV download already exists (shared/http.attachment, money.toDecimal, reports/csv.toCsv) beside a frozen legacy export with floating-point totals; the gateway caches /reports for an hour and the invoice page shows a void invoice at 0, so matching the page means a live path and the page\'s total.',
    must: [
      // Any existing source of the invoice numbers: the v3 plugin plan took the page's own rule (displayTotal over service.total).
      ['summary-model-reused', String.raw`invoices/summary\.js|summarize|\bview\b|displayTotal|(service|invoices)\.total\b`,'summarize (src/invoices/summary.js:6) has the id, customer and status of each line, in cents'],
      // docs/architecture.md: the gateway caches /reports for an hour, so an export that must match the live page sits elsewhere.
      ['served-live', String.raw`(^|\W)/invoices(\.csv\b|/[\w.-]*(csv|export|download)|\?format=csv)`, 'GET /invoices.csv in src/invoices/routes.js:30, live, since /reports is cached for an hour (docs/architecture.md:8)'],
      // The page is view (src/invoices/routes.js), which shows a void invoice at 0; summarize and invoices.total do not.
      ['page-total-used', planned(String.raw`\bview\b|[Vv]oid${LINE}{0,120}(\b0\b|0\.00|zero)|(\b0\b|0\.00|zero)${LINE}{0,120}[Vv]oid`), 'each total is the page\'s view (src/invoices/routes.js:16), so a void invoice prints 0'],
      ['decimal-helper-reused', String.raw`toDecimal`, 'money.toDecimal (src/shared/money.js:35) writes each amount'],
      ['download-helper-reused', String.raw`attachment\(|http\.attachment|\battachment\b[^\n;]{0,60}(shared/http|http\.js)|(shared/http|http\.js)[^\n]{0,60}\battachment\b(?!;)|revenueCsv|revenue\.csv`, 'served like revenueCsv (src/reports/routes.js:5) through attachment (src/shared/http.js:8)'],
      ['policy-money-helper', String.raw`money\.(sum|toDecimal)|shared/money`, 'the grand total is money.sum of the cents (src/shared/money.js:18), formatted once'],
      ['policy-tests-next-to-module', String.raw`tests/(reports|invoices|shared)/[\w-]+\.test\.js`, 'tests/reports/routes.test.js gets the invoice CSV case'],
      ['policy-test-factory', FACTORY, 'tests/factory.js:21 makeInvoice builds the rows'],
    ],
    mustNot: [
      ['legacy-untouched', legacyAnchored, 'src/legacy/invoice-export.js:5 exportCsv is reused'],
      ['policy-no-float-money', FLOAT_MONEY, 'each line writes (totalCents / 100).toFixed(2)', 'src/legacy/invoice-export.js uses toFixed, which this plan avoids'],
      ['policy-routes-thin', planned(String.raw`routes\.js[^\n]{0,80}\b(toCsv|summarize|money\.\w+|\.map|\.reduce)\(`), 'src/reports/routes.js:5 maps summarize(invoice) into rows and calls toCsv(rows)', "src/reports/routes.js:5 stays thin: attachment(service.invoicesCsv(), { filename: 'invoices.csv' })"],
      ['policy-no-bare-error', BARE_ERROR, "throw new Error('empty export')", 'no bare Error is thrown'],
    ],
  },
  {
    name: 'plan-app-remind', slug: 'plan-app-remind', fixture: 'ts-app-medium-plan', size: 'narrow', version: 4,
    weights: { 'due-date-stored': 3, 'business-day': 3, 'due-date-source': 2, 'grace-days-honoured': 2, 'opt-out-in-patch': 2 },
    request: 'Send customers an email reminder when an invoice is overdue. A reminder for an invoice goes out at most once a day while it is unpaid and overdue. Customers can switch reminders off and on themselves, separately from receipts. It ships switched off.',
    description: 'A large multi-step feature across invoices, customers and notifications: the due date comes from the payment terms and must be kept since terms change, overdue from the configured grace, days in Finance\'s zone, the preference must pass the PATCH whitelist, the flag already exists, and src/notifications must not require invoices.',
    limits: { max_turns: 40, timeout_seconds: 1200 },
    iterations: 3,
    must: [
      ['policy-flag-reused', String.raw`overdueReminders`, 'the overdueReminders flag (src/flags.js:5) already exists and is off'],
      ['due-date-source', TERMS, 'the due day is dueDateFor (src/invoices/terms.js:6) with the customer\'s terms'],
      ['due-date-stored', DUE_STORED, 'dueDate is stored on the invoice at create (src/invoices/model.js:3): the back office can change the terms later (src/customers/patch.js:10)'],
      ['grace-days-honoured', GRACE, 'overdue means past the due day plus config.overdueGraceDays (src/config.js:9)'],
      ['business-day', BUSINESS_DAY, 'once a day and overdue count in clock.businessDay() (src/shared/clock.js:9), not the UTC day'],
      ['opt-out-in-patch', String.raw`customers/patch\.js|FIELDS|patchable|\bpick\(`, 'FIELDS (src/customers/patch.js:4) gains reminders, or PATCH drops it'],
      ['policy-validation-shared', String.raw`validateBoolean`, "validateBoolean (src/shared/validation/boolean.js:3) checks it, as receipts does"],
      ['opt-out-in-contact', String.raw`contactFor`, 'contactFor (src/customers/service.js:35) returns the reminders preference'],
      ['once-a-day-record', String.raw`last\w*[Rr]emind\w*|[Rr]emind\w*(At|On|Day|Date)\b|forCustomer|notifications/repository\.js|sentAt`, 'lastRemindedOn on the invoice, compared with clock.today(), keeps it to one a day'],
      ['policy-test-factory', FACTORY, 'tests/factory.js:21 makeInvoice takes dueDate'],
    ],
    mustNot: [
      ['legacy-untouched', legacyAnchored, 'src/legacy/payment-hooks.js:5 is extended'],
      ['policy-no-bare-error', BARE_ERROR, "throw new Error('reminders are off')", 'a ValidationError, never new Error'],
      ['policy-no-float-money', FLOAT_MONEY, 'the mail shows (outstanding / 100).toFixed(2)', 'the mail uses money.format, no toFixed'],
      ['policy-no-manual-reset', planned(String.raw`\b(db|flags|clock|bus|channels)\.(reset|clear|clearOutbox)\(`, String.raw`setup\.js|already`), 'beforeEach(() => flags.reset())', 'tests/setup.js already runs flags.reset() before each test'],
      // docs/architecture.md:12 and tests/architecture.test.js: nothing under src/notifications requires invoices. A job in invoices
      // that calls a notifications service function, or an event a notifications handler subscribes to, passes.
      ['policy-feature-boundary', planned(NOTIFICATIONS_READ_INVOICES, String.raw`(called|invoked|used) (from|by)`),
        'new: src/notifications/reminders.js runOverdueReminders lists invoices through invoices/service',
        'src/invoices/service.js:64 selects the overdue invoices and calls sendOverdueReminder in src/notifications/service.js:10'],
    ],
  },
  {
    name: 'plan-app-vague', slug: 'plan-app-vague', fixture: 'ts-app-medium-plan', size: 'narrow', version: 4,
    weights: { 'due-date-stored': 2, 'business-day': 2, 'terms-found': 2, 'overdue-rule-found': 2 },
    request: 'Late payers are a mess for us. Make the billing service handle them better.',
    description: 'A vague request: invoices store no due date though the mail prints one from terms the back office can change, Finance has an overdue grace and a time zone, the aging report counts from the issue date and a reminders flag is off; the plan has to ground itself in that and say what it assumed.',
    must: [
      ['no-due-date-noticed', String.raw`(no|not|without|lacks?|missing|has none|does not (have|carry|store)|doesn't|never)[^\n]{0,60}([Dd]ue ?[Dd]ate|dueDate|due day)|([Dd]ue ?[Dd]ate|dueDate|due day)[^\n]{0,120}(not|isn't|is never|n't be) stored`,'invoices carry no dueDate today (src/invoices/model.js:3)'],
      ['terms-found', TERMS, 'the invoice mail prints a pay-by day from dueDateFor (src/invoices/terms.js:6) that is never stored'],
      ['due-date-stored', DUE_STORED, 'Iteration 1 stores dueDate on the invoice at create, since a customer\'s terms can change (src/customers/patch.js:10)'],
      ['overdue-rule-found', GRACE, 'Finance counts overdue after config.overdueGraceDays (src/config.js:9)'],
      ['business-day', BUSINESS_DAY, 'overdue is counted in clock.businessDay() (src/shared/clock.js:9)'],
      ['aging-by-issue-noticed', String.raw`(aging|bucketFor)[^\n]{0,120}(issue|issuedAt)|(issue|issuedAt)[^\n]{0,120}(aging|bucketFor)`, 'the aging report buckets by days since the issue date (src/reports/service.js:45)'],
      ['assumptions-stated', String.raw`[Aa]ssum|[Oo]pen decision`, 'Assumptions: late payers means unpaid invoices past a due date'],
      ['left-out-stated', String.raw`[Ll]eaves? out|[Ll]eft out|[Oo]ut of scope|[Oo]pen decision|[Nn]ot (in|part of) (this|scope)|[Nn]ot covered|[Dd]eferred|[Ff]ollow-?up`, 'Leaves out: late fees and payment plans, left as an open decision'],
      ['policy-test-factory', FACTORY, 'tests/factory.js:21 makeInvoice builds the cases'],
    ],
    mustNot: [
      ['legacy-untouched', legacyAnchored, 'src/legacy/invoice-total.js:4 is reused'],
      ['policy-no-bare-error', BARE_ERROR, "throw new Error('customer is blocked')", 'a ConflictError, never new Error'],
      ['policy-no-float-money', FLOAT_MONEY, 'late fee = Math.round(total * 0.02 * 100) / 100', 'the fee is money.percentOf in cents'],
      // Features with nothing to do with late payment: free-text invoice search and the top-customers ranking.
      ['no-unrelated-feature', planned(String.raw`(invoices/search|reports/top-customers)\.js:\d`), 'src/invoices/search.js:6 gains a late filter', 'src/reports/top-customers.js:1 is unrelated'],
    ],
  },
  {
    // Graded on the plan-body.md the route writes (a Write call), since the draft that survives has a timestamped name.
    name: 'plan-app-draft', slug: 'plan-app-draft', fixture: 'ts-app-medium-plan', size: 'narrow', draft: true, version: 2,
    weights: { 'refund-payload-extended': 2 },
    request: 'Send the customer an email when a payment is refunded. Today the refund handler only logs it.',
    description: 'No gate answer is given: the plan stays a draft, the gate is printed, nothing is promoted, and the closing message must not call the plan accepted. The refund event carries no customerId and notifications may not require invoices, so the payload has to grow.',
    must: [
      ['refund-handler-extended', String.raw`onPaymentRefunded|notifications/handlers\.js`, 'src/notifications/handlers.js:25 onPaymentRefunded sends the mail'],
      ['refund-payload-extended', `payments/service\\.js${LINE}{0,200}customerId|customerId${LINE}{0,200}(payments/service\\.js|PAYMENT_REFUNDED|payment\\.refunded)|(PAYMENT_REFUNDED|payment\\.refunded)${LINE}{0,120}customerId`, 'src/payments/service.js:48 adds customerId to the payment.refunded payload'],
      ['flag-and-preference-kept', String.raw`receiptEmails|receipts`, 'it keeps the receiptEmails flag and the customer receipts preference as onPaymentReceived does'],
      ['policy-money-format', String.raw`money\.format`, 'the amount is money.format (src/shared/money.js:41)'],
      ['policy-tests-next-to-module', String.raw`tests/notifications/[\w-]+\.test\.js`, 'tests/notifications/handlers.test.js:52 replaces the refund-is-only-logged case'],
    ],
    mustNot: [
      ['policy-no-reach-back', planned(String.raw`(handlers|notifications/[\w-]+)\.js${LINE}{0,160}(invoices\.get|invoices/(service|repository)|require\([^)]*invoices)`), 'src/notifications/handlers.js:25 looks the customer up with invoices.get(event.invoiceId)', 'src/notifications/handlers.js:25 must not require invoices/service (tests/architecture.test.js)'],
      ['legacy-untouched', legacyAnchored, 'src/legacy/payment-hooks.js:5 is extended'],
      ['policy-no-bare-error', BARE_ERROR, "throw new Error('customer missing')", 'never a bare Error'],
    ],
  },
];

/** The text a good plan for `spec` would hold: every positive sample, plus enough `Goal` headings for its iterations. */
export const goodPlan = (spec) => [...spec.must.map(([, , sample]) => sample), ...Array(spec.iterations ?? 1).fill('Goal: one iteration')].join('\n');

/** A Write of the route's plan body whose content matches `pattern`: how the draft case, whose saved draft has no fixed name, is graded. */
export const planBodyWrite = (pattern) => String.raw`^(?=[\s\S]*plan-body\.md)[\s\S]*?(?:${pattern})`;

export function planCases({ regex, ledger, tool, never, exists, llm, shared, DONE }) {
  // A promoted plan is renamed to plan.md. closeRoute removes steps/ at every route exit (run-context.ts), so a draft nobody
  // accepted survives only as plan-draft_<timestamp>.md: no literal path, hence the draft case checks it by glob and its
  // content on the Write of steps/plan-body.md.
  const body = (slug) => `.ambicode/tasks/${slug}/plan.md`;
  const T = (slug) => `.ambicode/tasks/${slug}/ledger.jsonl`;
  // Source and test directories of every fixture; the plan route itself writes only below .ambicode/.
  const WRITE_SOURCE = String.raw`"file_path":"[^"]*/(src|tests?|internal|cmd|engine|dashboard|tools|domain|application|adapters|bootstrap)/`;
  // A plan-check row with no bad anchor: the first check, or the one after the fix round.
  const checked = (slug) => [ledger('anchors-valid', '"worker":"plan-check"[^\\n]*"anchorsBad":0', T(slug))];
  // The one Edit the route allows is the fix of its own plan body after a failed check.
  const NOT_PLAN_BODY = String.raw`"file_path":"(?![^"]*/\.ambicode/tasks/[^"/]+/steps/plan-body\.md")`;

  return PLAN_SPECS.map((spec) => {
    const { slug } = spec;
    const at = body(slug);
    // A trap check (an existing mechanism a skim misses) weighs 2, so missing two or three of them costs a plan about 0.2.
    const weightOf = (name) => spec.weights?.[name] ?? 1;
    const planText = (name, pattern, match = 'contains') => shared(regex(name, pattern, { file: at, match, weight: weightOf(name) }), regex(name, pattern, { match, weight: weightOf(name) }));
    const content = [
      ...spec.must.map(([name, pattern]) => planText(name, pattern)),
      ...spec.mustNot.map(([name, pattern]) => planText(name, pattern, 'not_contains')),
      ...(spec.llm ? [shared(llm(spec.llm[0], spec.llm[1], { file: at }), llm(spec.llm[0], spec.llm[1]))] : []),
    ];
    const boundary = [
      shared(never('no-edit', 'Edit', NOT_PLAN_BODY), never('no-edit', 'Edit', '.')),
      shared(never('no-write-source', 'Write', WRITE_SOURCE)),
      shared(never('no-checks-run', 'Bash', CHECK_COMMANDS)),
    ];
    const asked = `/ambicode:plan --task ${slug}`;
    const flags = '--ambicode-init --context';
    const base = { name: spec.name, description: spec.description, tags: ['plan', spec.size], version: spec.version ?? 1, fixture: spec.fixture, flags, ...(spec.limits ? { limits: spec.limits } : {}) };

    if (spec.draft) {
      return {
        ...base,
        tags: ['plan', 'gate'],
        prompt: `${asked} ${spec.request}`,
        bare: null,
        graders: [
          exists('plan-draft-saved', `.ambicode/tasks/${slug}/plan-draft_*.md`),
          ledger('accept-gate-printed', '"kind":"gate","gate":"plan-accept"', T(slug)),
          ledger('not-promoted', '"note":"plan"', T(slug), { match: 'not_contains' }),
          ...checked(slug),
          ...spec.must.map(([name, pattern]) => tool(name, 'Write', planBodyWrite(pattern), { weight: weightOf(name) })),
          ...spec.mustNot.map(([name, pattern]) => never(name, 'Write', planBodyWrite(pattern))),
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
      prompt: `${asked} --headless --answer plan-accept=Accept ${request}`,
      bare: `Write an implementation plan for this change, in iterations that can each be reviewed alone, and give the plan as your answer; do not implement it. If something is unclear, state your assumptions. ${request}`,
      graders: [
        exists('plan-written', at),
        regex('three-fields', 'Goal[\\s\\S]*Changes[\\s\\S]*Checks', { file: at }),
        ...checked(slug),
        DONE(T(slug)),
        ...iterationGraders,
        ...content,
        ...boundary,
      ],
    };
  });
}
