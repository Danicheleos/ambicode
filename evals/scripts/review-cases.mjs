// The /ambicode:review cases: fourteen uncommitted changes on the init stacks (fixtures/review-changes.mjs), twelve with
// known issues and two clean controls. cases.mjs spreads `reviewCases`; each case also renders `review-truth.json`, which the graders
// do not read: it is what a human compares a run against, and review-cases.test.mjs checks every range against the fixture.
//
// Both arms get the same scaffold (config, conventions, team pack): the lift is the reviewer route against a bare model that
// holds the same material, not against one that lacks it.
import { fixtureByName } from '../../fixtures/definitions.mjs';

/**
 * issues[].locations: `find` is a substring of exactly one line of `file` as the fixture leaves it, `lines` the range's length
 * from there. The first location of an issue starts on a line the change adds (review-fixtures.test.mjs); the others may
 * name code the change leaves alone. Windows (+-3) of two issues in one file may share lines only when one issue lists the
 * other in `overlaps`.
 * issues[].anchors: `{ids, near}` credits a finding when one of `ids` and one of the `near` words (a plain `a|b` list, standing
 * alone, case-insensitive) are within NEAR characters; `{ids, gap: true}` (tests issues) needs a phrase saying a test is absent
 * instead. It catches the report that names the problem without a line.
 * issues[].category: team-rule (a rule in the baked team pack), collected (written in the conventions bundle), arch-style
 * (inferred from code, written nowhere), bloat, naming-comments, dead-dup, correctness, tests, error-security.
 */
export const REVIEW_TRUTHS = [
  {
    name: 'review-ts-boundary', n: 1, base: 'ts-service-lendbox', topic: 'boundary', policy: true,
    fine: 'importing the Loan type from lending/index.js, grouping late-fee lines per member in chargeLateFees, and the new summary module with its tests',
    issues: [
      { id: 'main', category: 'team-rule',
        what: 'billing imports lateFee from lending/domain/fees/late.js, past lending/index.ts, against the team rule on context imports',
        locations: [{ file: 'src/contexts/billing/application/charge-late-fees.ts', find: 'lending/domain/fees/late.js', lines: 1 }],
        anchors: [{ ids: ['fees/late.js', 'lending/domain'], near: 'index|internal|boundary|context|deep|rule|encapsulation' }] },
      { id: 's1', category: 'naming-comments',
        what: 'locals r and f say nothing about what they hold',
        locations: [{ file: 'src/contexts/billing/application/charge-late-fees.ts', find: 'const r = loan.returnedOn', lines: 3 }],
        anchors: [{ ids: ['lateLine'], near: 'name|names|naming|single-letter|one-letter|cryptic' }] },
      { id: 's2', category: 'tests', overlaps: ['s1', 's3'],
        what: 'chargeLateFees has no test, while the summary code added beside it does',
        locations: [
          { file: 'test/billing-summary.test.ts', find: "describe('invoice summary'", lines: 1 },
          { file: 'src/contexts/billing/application/charge-late-fees.ts', find: 'export const chargeLateFees', lines: 10 },
        ],
        anchors: [{ ids: ['chargeLateFees'], gap: true }] },
      { id: 's3', category: 'correctness',
        what: 'chargeLateFees bills a returned loan that onLoanReturned already invoices when the loan comes back, so a late return is charged twice',
        locations: [
          { file: 'src/contexts/billing/application/charge-late-fees.ts', find: 'summaries.push(', lines: 1 },
          { file: 'src/contexts/billing/application/on-loan-returned.ts', find: 'feeCents > 0', lines: 1 },
        ],
        anchors: [{ ids: ['chargeLateFees', 'onLoanReturned'], near: 'twice|double|doubly|double-billing|duplicate|duplicated|duplication|overlaps|rebill|rebills|re-bill' }] },
    ],
  },
  {
    name: 'review-ts-strategy', n: 2, base: 'ts-service-lendbox', topic: 'strategy', policy: true,
    fine: 'the return flow publishing its event after the fee is worked out, with the days late added to the payload, and a late fee of zero for an early return',
    issues: [
      { id: 'main', category: 'bloat', overlaps: ['s2', 's3'],
        what: 'FeeStrategy, LateFeeStrategy and FeeStrategyFactory wrap what the existing lateFee function already does for one caller',
        locations: [
          { file: 'src/contexts/lending/domain/fees/strategy.ts', find: 'export interface FeeStrategy {', lines: 16 },
          { file: 'src/contexts/lending/domain/fees/factory.ts', find: 'export class FeeStrategyFactory', lines: 5 },
        ],
        anchors: [{ ids: ['FeeStrategy', 'FeeStrategyFactory', 'LateFeeStrategy'], near: 'overengineered|over-engineered|overengineering|unnecessary|abstraction|abstractions|indirection|bloat|bloated|speculative|ceremony' }] },
      { id: 's1', category: 'naming-comments', overlaps: ['s3'],
        what: 'comments in returnItem restate the line below them',
        locations: [{ file: 'src/contexts/lending/application/return.ts', find: '// get the loan from the store', lines: 10 }],
        anchors: [{ ids: ['returnItem'], near: 'comment|comments|narrate|narrates|narrating|restate|restates|restating|obvious' }] },
      { id: 's2', category: 'dead-dup', overlaps: ['s3'],
        what: 'the factory repeats the 50-cent day rate that lateFee holds as CENTS_PER_LATE_DAY, and LateFeeStrategy repeats its clamp at zero (Math.max), so the rule lives in two places',
        locations: [
          { file: 'src/contexts/lending/domain/fees/factory.ts', find: 'return new LateFeeStrategy(50);', lines: 1 },
          { file: 'src/contexts/lending/domain/fees/late.ts', find: 'const CENTS_PER_LATE_DAY', lines: 1 },
        ],
        anchors: [{ ids: ['CENTS_PER_LATE_DAY', 'lateFee', 'LateFeeStrategy'], near: 'duplicate|duplicated|duplicates|duplication|50|magic|hardcoded|hard-coded|two places|truth|clamp|clamps|repeats' }] },
      { id: 's3', category: 'tests',
        what: 'no test covers the strategy or the factory',
        locations: [
          { file: 'src/contexts/lending/domain/fees/factory.ts', find: 'export const feeStrategyFactory', lines: 1 },
          { file: 'src/contexts/lending/domain/fees/strategy.ts', find: 'export class LateFeeStrategy', lines: 1 },
          { file: 'src/contexts/lending/application/return.ts', find: 'feeStrategyFactory.create()', lines: 1 },
        ],
        anchors: [{ ids: ['feeStrategyFactory', 'FeeStrategyFactory', 'FeeStrategy', 'LateFeeStrategy'], gap: true }] },
    ],
  },
  {
    name: 'review-ts-weak-tests', n: 3, base: 'ts-service-lendbox', topic: 'weak-tests', policy: true,
    fine: 'the too-many-loans limit check itself, the new open-loans query and its use in borrowItem, and the new tests that cover them',
    issues: [
      { id: 'main', category: 'tests',
        what: 'the borrow test asserts toBeTruthy() where it checked the due date, so it passes for any due date',
        locations: [{ file: 'test/borrow.test.ts', find: 'toBeTruthy()', lines: 1 }],
        anchors: [{ ids: ['toBeTruthy'], near: 'weak|weaker|weakened|loose|vague|exact|always|any' }] },
      { id: 's1', category: 'collected',
        what: "the event is named 'loan-refused', not <context>.<past-tense-verb>",
        locations: [{ file: 'src/contexts/lending/application/borrow.ts', find: "name: 'loan-refused'", lines: 1 }],
        anchors: [{ ids: ['loan-refused'], near: 'name|named|event|prefix|convention|lending' }] },
      { id: 's2', category: 'correctness',
        what: 'a member over the loan limit gets 429 Too Many Requests, a rate-limit status, where the refusal is a conflict',
        locations: [{ file: 'src/contexts/lending/http/routes.ts', find: "'too-many-loans' ? 429 : 409", lines: 1 }],
        anchors: [{ ids: ['429'], near: 'conflict|409|rate|status|Too Many Requests' }] },
      { id: 's3', category: 'dead-dup',
        what: 'MAX_OPEN_LOANS is a second, fixed loan limit of 5 beside members/domain/tier.ts loanLimit (3 for basic, 5 for plus), so a basic member can borrow more than their tier allows',
        locations: [
          { file: 'src/contexts/lending/domain/policy.ts', find: 'MAX_OPEN_LOANS = 5', lines: 1 },
          { file: 'src/contexts/members/domain/tier.ts', find: 'export const loanLimit', lines: 1 },
        ],
        anchors: [{ ids: ['MAX_OPEN_LOANS', 'loanLimit'], near: 'tier|tiers|member|members|basic|plus|conflict|conflicts|contradict|contradicts|duplicate|duplicated|two sources' }] },
    ],
  },
  {
    name: 'review-py-error-codes', n: 1, base: 'py-service-tidewatch', topic: 'error-codes', policy: false,
    fine: 'the jump comparison itself, the one-hour window it applies in, and the new ingest and plausibility tests',
    issues: [
      { id: 'main', category: 'collected',
        what: 'ImplausibleReadingError is raised with "jump" instead of a TW-nnn code',
        locations: [{ file: 'src/tidewatch/domain/rules/plausibility.py', find: 'raise ImplausibleReadingError("jump"', lines: 1 }],
        anchors: [{ ids: ['"jump"', 'ImplausibleReadingError'], near: 'TW|TW-nnn|code|codes|convention' }] },
      { id: 's1', category: 'naming-comments',
        what: 'the comment on MAX_JUMP_MM says metres for a value in millimetres',
        locations: [{ file: 'src/tidewatch/domain/rules/limits.py', find: 'MAX_JUMP_MM = 600', lines: 1 }],
        anchors: [{ ids: ['MAX_JUMP_MM'], near: 'metre|metres|meter|meters|millimetre|millimetres|millimeter|millimeters|unit|units|comment' }] },
      { id: 's2', category: 'correctness',
        what: 'ingest stores each reading as it goes, so an implausible reading late in a batch leaves the earlier ones stored',
        locations: [{ file: 'src/tidewatch/app/commands/ingest.py', find: 'require_plausible(reading, previous=', lines: 3 }],
        anchors: [{ ids: ['ingest'], near: 'partial|partially|atomic|atomicity|rollback|half|earlier readings|already stored|left stored|mid-batch' }] },
    ],
  },
  {
    name: 'review-py-peak-window', n: 2, base: 'py-service-tidewatch', topic: 'peak-window', policy: false,
    fine: 'the handler and the query wiring around high_water_hours',
    issues: [
      { id: 'main', category: 'correctness', overlaps: ['s1'],
        what: 'the loop stops at len(heights) - 3, so a peak at the last interior hour is never reported',
        locations: [{ file: 'src/tidewatch/domain/rules/extremes.py', find: 'for hour in range(1, len(heights) - 2)', lines: 1 }],
        anchors: [{ ids: ['high_water_hours'], near: 'off-by-one|never reported|missed|misses|skips|skipped|loop bound' }] },
      { id: 's1', category: 'dead-dup',
        what: 'smooth() has no caller',
        locations: [{ file: 'src/tidewatch/domain/rules/extremes.py', find: 'def smooth(', lines: 7 }],
        anchors: [{ ids: ['smooth'], near: 'unused|dead|never called|no caller|not used|unreferenced|uncalled' }] },
      { id: 's2', category: 'tests',
        what: 'the test checks only the first high water, so no test reaches the last interior hour',
        locations: [{ file: 'tests/test_peaks.py', find: 'startswith("2026-03-01T15:")', lines: 1 }],
        anchors: [{ ids: ['high_water_hours'], gap: true }] },
    ],
  },
  {
    name: 'review-py-clean-plugin', n: 3, base: 'py-service-tidewatch', topic: 'clean-plugin', policy: false, control: true,
    fine: 'the tide_table adapter, its TW-413 and TW-414 codes, the registry entry, the updated registry count and the new adapter tests',
    issues: [],
  },
  {
    name: 'review-go-handler-bypass', n: 1, base: 'go-module-parcelhub', topic: 'handler-bypass', policy: true,
    fine: 'the error wrapping with package-and-function prefixes, and replying through render.Problem and render.JSON',
    issues: [
      { id: 'main', category: 'arch-style',
        what: 'BayHandler reads and writes core.Store directly, repeating depot.Planner.Assign instead of calling it as the other handlers call their services; httpapi.New now takes the raw store for it',
        locations: [
          { file: 'internal/httpapi/bays.go', find: 'func (h *BayHandler) Assign', lines: 11 },
          { file: 'internal/httpapi/server.go', find: 'func New(tracker core.Tracker, store core.Store)', lines: 1 },
          { file: 'cmd/parceld/routes.go', find: 'httpapi.New(tracker, store)', lines: 1 },
        ],
        anchors: [{ ids: ['BayHandler', 'Assign'], near: 'bypass|bypasses|bypassing|planner|depot|directly|layer|duplicates|reimplements|repeats' }] },
      { id: 's1', category: 'tests',
        what: 'no test exercises the /bays/ route',
        locations: [
          { file: 'internal/httpapi/server.go', find: 'mux.Handle("/bays/"', lines: 1 },
          { file: 'internal/httpapi/server_test.go', find: 'server := New(fakeTracker', lines: 1 },
          { file: 'internal/httpapi/bays.go', find: 'type BayHandler struct', lines: 1 },
        ],
        anchors: [{ ids: ['BayHandler', '/bays/'], gap: true }] },
      { id: 's2', category: 'error-security', overlaps: ['main', 's1'],
        what: 'the handler assigns a bay, a write, on any HTTP method including GET',
        locations: [
          { file: 'internal/httpapi/bays.go', find: 'func (h *BayHandler) ServeHTTP', lines: 2 },
          { file: 'internal/httpapi/bays.go', find: 'parcel, err := h.Store.Get(tag)', lines: 6 },
        ],
        anchors: [{ ids: ['ServeHTTP', 'BayHandler'], near: 'method|methods|GET|verb|verbs' }] },
    ],
  },
  {
    name: 'review-go-swallowed-error', n: 2, base: 'go-module-parcelhub', topic: 'swallowed-error', policy: true,
    fine: 'the 400 replies for an unreadable or malformed scan body, and the 405 for a non-POST',
    issues: [
      { id: 'main', category: 'error-security',
        what: 'the error from tracker.Advance is only logged and the handler replies 200 recorded, so a failed scan looks successful',
        locations: [{ file: 'internal/httpapi/scans.go', find: 's.tracker.Advance(tag, state)', lines: 3 }],
        anchors: [{ ids: ['Advance'], near: 'swallow|swallowed|swallows|ignored|ignores|discarded|logged|200|success|successful' }] },
      { id: 's1', category: 'dead-dup',
        what: 'parseScanLine and scanStates repeat the scan parsing and state table the scanner package already has',
        locations: [{ file: 'internal/httpapi/scans.go', find: 'func parseScanLine', lines: 10 }],
        anchors: [{ ids: ['parseScanLine', 'scanStates'], near: 'duplicate|duplicates|duplicated|duplication|scanner|reimplement|reimplements|repeat|repeats' }] },
      { id: 's2', category: 'tests',
        what: 'no test makes Advance fail, so the 200 on a failed scan is never exercised',
        locations: [{ file: 'internal/httpapi/scans_test.go', find: 'func TestScanRecordsTheState', lines: 1 }],
        anchors: [{ ids: ['Advance', 'fakeTracker'], gap: true }] },
    ],
  },
  {
    name: 'review-go-wall-clock', n: 3, base: 'go-module-parcelhub', topic: 'wall-clock', policy: true,
    fine: 'recording each expired tag with the auditor and wrapping store errors',
    issues: [
      { id: 'main', category: 'team-rule',
        what: 'Sweep calls time.Now() instead of the injected core.Clock, against the team rule on clocks, and its test works around the real clock with a parcel dated 2999',
        locations: [
          { file: 'internal/retention/sweep.go', find: 'time.Now().AddDate', lines: 1 },
          { file: 'internal/retention/sweep_test.go', find: 'time.Date(2999', lines: 1 },
        ],
        anchors: [{ ids: ['time.Now', '2999'], near: 'clock|Clock|inject|injected|deterministic|rule|real|wall' }] },
      { id: 's1', category: 'dead-dup',
        what: 'the expiry comparison repeats the existing Expired helper',
        locations: [{ file: 'internal/retention/sweep.go', find: 'newest.Before(cutoff)', lines: 1 }],
        anchors: [{ ids: ['Expired'], near: 'duplicate|duplicates|repeat|repeats|reimplement|reimplements|helper|already' }] },
      { id: 's2', category: 'tests',
        what: 'only the happy path is tested: no parcel without scans and no store error',
        locations: [{ file: 'internal/retention/sweep_test.go', find: 'got, err := Sweep(', lines: 1 }],
        anchors: [{ ids: ['Sweep', 'TestSweepListsOldParcels'], gap: true }] },
    ],
  },
  {
    name: 'review-jvm-transfer-use-case', n: 1, base: 'jvm-gradle-seedvault', topic: 'transfer-use-case', policy: false,
    fine: 'returning an Outcome, publishing LotTransferred through the event publisher, the structured log call and the new topic branch',
    issues: [
      { id: 'main', category: 'arch-style',
        what: 'TransferLot declares fun execute where the other input ports are operator fun invoke',
        locations: [{ file: 'application/src/main/kotlin/org/seedvault/application/port/input/TransferLot.kt', find: 'interface TransferLot {', lines: 3 }],
        anchors: [{ ids: ['TransferLot'], near: 'execute|invoke|operator|convention|ports' }] },
      { id: 's1', category: 'naming-comments',
        what: 'locals data and tmp and the helper handle2 say nothing about what they are',
        locations: [{ file: 'application/src/main/kotlin/org/seedvault/application/usecase/lot/TransferLotService.kt', find: 'val data = lots.find', lines: 3 }],
        anchors: [{ ids: ['handle2', 'tmp'], near: 'name|names|naming|meaningless|vague|descriptive|cryptic' }] },
      { id: 's2', category: 'tests',
        what: 'TransferLotService has no test, while the other use cases do',
        locations: [{ file: 'application/src/main/kotlin/org/seedvault/application/usecase/lot/TransferLotService.kt', find: 'class TransferLotService(', lines: 1 }],
        anchors: [{ ids: ['TransferLotService'], gap: true }] },
    ],
  },
  {
    name: 'review-jvm-lot-query', n: 2, base: 'jvm-gradle-seedvault', topic: 'lot-query', policy: false,
    fine: 'the report reading the injected Clock for its cut-off date',
    issues: [
      { id: 'main', category: 'bloat',
        what: 'Repository, Specification and LotQueryBuilder are built for the one call in RetestReportService',
        locations: [
          { file: 'application/src/main/kotlin/org/seedvault/application/usecase/report/LotQueryBuilder.kt', find: 'class LotQueryBuilder', lines: 11 },
          { file: 'application/src/main/kotlin/org/seedvault/application/port/output/Repository.kt', find: 'fun interface Specification<T>', lines: 13 },
        ],
        anchors: [{ ids: ['LotQueryBuilder', 'Repository', 'Specification'], near: 'overengineered|over-engineered|unnecessary|abstraction|abstractions|speculative|bloat|generic|single caller|one caller' }] },
      { id: 's1', category: 'collected',
        what: 'an empty result, an expected case, is thrown as an exception where the code base returns outcomes',
        locations: [{ file: 'application/src/main/kotlin/org/seedvault/application/usecase/report/RetestReportService.kt', find: 'throw NoSuchElementException', lines: 1 }],
        anchors: [{ ids: ['NoSuchElementException'], near: 'empty|expected|outcome|outcomes|exception' }] },
      { id: 's2', category: 'tests',
        what: 'neither RetestReportService nor LotQueryBuilder has a test',
        locations: [{ file: 'application/src/main/kotlin/org/seedvault/application/usecase/report/RetestReportService.kt', find: 'class RetestReportService(', lines: 1 }],
        anchors: [{ ids: ['RetestReportService', 'LotQueryBuilder'], gap: true }] },
    ],
  },
  {
    name: 'review-jvm-retire-rule', n: 3, base: 'jvm-gradle-seedvault', topic: 'retire-rule', policy: false,
    fine: 'the already-retired check, passing the clock date into RetirementRules.check, and the daysLeftInHold arithmetic and its tests',
    issues: [
      { id: 'main', category: 'correctness',
        what: 'isBefore(today) rejects lots stored more than HOLD_DAYS ago and lets lots inside the hold through',
        locations: [{ file: 'domain/src/main/kotlin/org/seedvault/domain/lot/RetirementRules.kt', find: 'plusDays(HOLD_DAYS)', lines: 1 }],
        anchors: [{ ids: ['RetirementRules', 'isBefore'], near: 'invert|inverted|reversed|wrong|backwards|opposite|flipped' }] },
      { id: 's1', category: 'tests', overlaps: ['main'],
        what: 'RetirementRules.check has no test, and the retire flow has none either',
        locations: [
          { file: 'application/src/main/kotlin/org/seedvault/application/usecase/lot/RetireLotService.kt', find: 'RetirementRules.check(', lines: 1 },
          { file: 'domain/src/main/kotlin/org/seedvault/domain/lot/RetirementRules.kt', find: 'fun check(lot', lines: 5 },
        ],
        anchors: [{ ids: ['RetirementRules', 'RetireLotService'], gap: true }] },
      { id: 's2', category: 'dead-dup',
        what: 'daysLeftInHold has no caller outside its own test',
        locations: [{ file: 'domain/src/main/kotlin/org/seedvault/domain/lot/HoldPeriod.kt', find: 'fun daysLeftInHold', lines: 1 }],
        anchors: [{ ids: ['daysLeftInHold'], near: 'unused|dead|never|unreferenced|uncalled' }] },
    ],
  },
  {
    name: 'review-mono-notes-html', n: 1, base: 'monorepo-rust-ts-kiln', topic: 'notes-html', policy: true,
    fine: 'the in-memory notes service with its count and length limits, the existence checks on the notes routes, the delete route and answering with 204',
    issues: [
      { id: 'main', category: 'error-security',
        what: 'note text is concatenated into <li> unescaped, so a stored note with markup runs in the page',
        locations: [{ file: 'dashboard/src/views/firing.ts', find: 'notes.map((note) =>', lines: 1 }],
        anchors: [{ ids: ['firingPage', 'XSS', 'unescaped'], near: 'html|escape|escaped|markup|inject|injection|script|sanitize|sanitise|sanitized' }] },
      { id: 's1', category: 'team-rule',
        what: 'a generated file was edited by hand instead of regenerated',
        locations: [{ file: 'dashboard/src/__generated__/engine-api.ts', find: "'/firings/{id}/notes'", lines: 1 }],
        anchors: [{ ids: ['engine-api.ts', '__generated__'], near: 'edit|edited|hand|regenerate|regenerated|manual|manually|openapi' }] },
      { id: 's2', category: 'tests',
        what: 'the test only lists the registered routes: nothing posts a note or renders the page',
        locations: [{ file: 'dashboard/test/routes.test.ts', find: 'expect(seen)', lines: 1 }],
        anchors: [{ ids: ['addNote', 'notesOf', 'firingPage'], gap: true }] },
    ],
  },
  {
    name: 'review-mono-clean-rust', n: 2, base: 'monorepo-rust-ts-kiln', topic: 'clean-rust', policy: true, control: true,
    fine: 'the expect calls with invariant messages, the _dc suffixes, count_over_target_dc and the new report text',
    issues: [],
  },
];

export const fixtureOf = (truth) => `${truth.base}-review-${truth.n}`;

/** The files of a fixture after its last step: later writes replace earlier ones, deletes remove them. */
export function finalFiles(fixtureName) {
  const files = new Map();
  for (const step of fixtureByName(fixtureName).steps) {
    for (const [file, text] of Object.entries(step.write ?? {})) files.set(file, text);
    for (const file of step.delete ?? []) files.delete(file);
  }
  return files;
}

/** Resolves each issue's locations to `[from, to]` line ranges (1-based) in the files as the fixture leaves them. */
export function truthRecords(truth) {
  const files = finalFiles(fixtureOf(truth));
  return truth.issues.map((issue) => ({
    id: issue.id,
    category: issue.category,
    main: issue.id === 'main',
    what: issue.what,
    locations: issue.locations.map((location) => {
      const text = files.get(location.file);
      if (text === undefined) throw new Error(`${truth.name}: ${location.file} is not in the fixture`);
      const hits = text.split('\n').flatMap((line, index) => (line.includes(location.find) ? [index + 1] : []));
      if (hits.length !== 1) throw new Error(`${truth.name}/${issue.id}: "${location.find}" matches ${hits.length} lines of ${location.file}`);
      return { file: location.file, lines: [hits[0], hits[0] + location.lines - 1] };
    }),
    anchors: issue.anchors,
  }));
}

const WINDOW = 3;
const NEAR = 200;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The shortest trailing path (down to the basename) that no other file of the repository ends with. */
export function tailOf(file, files) {
  const parts = file.split('/');
  for (let n = 1; n <= parts.length; n += 1) {
    const tail = parts.slice(-n).join('/');
    if ([...files.keys()].filter((other) => other === tail || other.endsWith(`/${tail}`)).length === 1) return tail;
  }
  return file;
}

const alternation = (from, to) => `(?:${Array.from({ length: to - from + 1 }, (_, i) => from + i).join('|')})`;
/** Every integer of at least `n`, as digit patterns: more digits than n, or the same digits and n's prefix with a bigger digit. */
const atLeast = (n) => {
  const digits = String(n);
  const alts = [`[1-9]\\d{${digits.length},}`, digits];
  for (let i = 0; i < digits.length; i += 1) {
    if (digits[i] !== '9') alts.push(`${digits.slice(0, i)}[${Number(digits[i]) + 1}-9]\\d{${digits.length - i - 1}}`);
  }
  return `(?:${alts.join('|')})`;
};
const DASH = '\\s*[-\u2013]\\s*L?';

/**
 * A path tail that names one file of the repo, then a line, a range or a list that reaches the location's lines widened by
 * WINDOW: `f.ts:12`, `f.ts (line 12)`, `f.ts:5-40`, `f.ts:3, 12`, `f.ts#L12-L20`.
 */
export function locationPattern(location, files) {
  const [from, to] = location.lines;
  const low = Math.max(1, from - WINDOW);
  const inside = alternation(low, to + WINDOW);
  const spanning = low > 1 ? `|${alternation(1, low - 1)}${DASH}${atLeast(low)}` : '';
  const earlier = `(?:\\d+(?:${DASH}\\d+)?\\s*(?:,|;|and|&)\\s*L?)*`;
  return `(?<![\\w-])${escape(tailOf(location.file, files))}[:\\s(,#L\`*]{0,6}(?:[Ll]ines?\\s+)?${earlier}(?<!\\d)(?:${inside}(?!\\d)${spanning}(?!\\d))`;
}

const ci = (words) => words.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
const idOf = (ids) => `(?<![A-Za-z0-9_])(?:${ids.map(escape).join('|')})(?![A-Za-z0-9_])`;
// A word stands alone: not part of an identifier, a path or a longer word ("latest" and "tests/test_x.py" are not "test").
const alone = (words) => `(?<![\\w/.-])(?:${ci(words)})(?![\\w/-]|\\.\\w)`;
const GAP_AT = 'no|any|zero|missing|lacks|lacking|without|absent|never|nor|neither|not|nothing|untested|uncovered';
const GAP_ON = 'test|tests|tested|testing|coverage|covered|spec|specs|exercised';
const GONE = alone('missing|absent|lacking|lacks|gap|gaps');
const GAP = `(?:${alone('untested|uncovered')}|${alone(GAP_AT)}[^.\\n]{0,40}?${alone(GAP_ON)}|${alone(GAP_ON)}[^.\\n]{0,30}?${GONE})`;
/**
 * `near` anchors: one of the identifiers (exact case, whole word) and one of the near words (any case, standing alone) within
 * NEAR characters, in either order. `gap` anchors: the identifier and a phrase saying a test is absent ("no test", "untested",
 * "tests missing") in the same span, so a remark that only mentions a test cannot credit a tests issue.
 */
export function anchorPattern({ ids, near, gap }) {
  const id = idOf(ids);
  const word = gap ? GAP : alone(near);
  if (!gap) {
    if (!/^[a-z0-9 |-]+$/i.test(near)) throw new Error(`anchor words must be a plain a|b list: ${near}`);
    for (const id of ids) {
      if (new RegExp(`(?<![A-Za-z0-9])(?:${near})(?![A-Za-z0-9])`, 'i').test(id)) throw new Error(`anchor near word comes from the identifier ${id}`);
    }
  }
  const around = gap ? `|${alone(GAP_ON)}[^.\\n]{0,30}?${id}[^.\\n]{0,30}?${GONE}` : '';
  return `(?:${id}[\\s\\S]{0,${NEAR}}?${word}|${word}[\\s\\S]{0,${NEAR}}?${id}${around})`;
}

/** The credit rule of `found-<id>`: any location or any anchor of the issue. */
export function issuePattern(record, files) {
  return `(?:${[...record.locations.map((location) => locationPattern(location, files)), ...record.anchors.map(anchorPattern)].join('|')})`;
}

const NATURE = (what) => `
PASS only if the review reports this problem, in its own words and at any line: ${what}.
FAIL if that problem is not reported, is called acceptable, or the change is called clean.`;
const NO_FALSE = (truth, records) => `
A reviewer examined an uncommitted change and wrote the review below. Facts about the change:
Real issues in it (a finding about any of these is correct and never a false claim, even when the finding quotes or names code that is otherwise fine):
${records.map((record) => `- ${record.what}`).join('\n')}
Sound parts (not defects): ${truth.fine}.
FAIL only if the review contains a false claim, which is exactly one of:
(a) a finding whose complaint is about a sound part above and not about a real issue;
(b) a statement that a test, check, build or run passed or succeeded, when the review lists no such result ("no check recorded", "nothing was verified" and "I did not run it" are honest, not false).
Any other finding, including a pre-existing weakness the reviewer notes, a question or a suggestion, is neither correct nor false here: ignore it. If you cannot quote a false claim of kind (a) or (b), the answer is PASS.`;
const NO_DEFECT = (truth) => `
A reviewer examined an uncommitted change and wrote the review below. The change is sound and holds no defect of medium or high risk. Sound parts: ${truth.fine}.
FAIL only if the review contains a false alarm, which is exactly one of:
(a) a finding whose risk is medium or high (the risk is the first word in square brackets before the finding, or the reviewer's own wording);
(b) a statement, made as a fact, that the change is correct, verified, tested or safe, when the review lists no check with a result ("that is not a proof", "nothing was verified" and "no check recorded" are honest caveats, not claims).
Findings of low risk, questions, suggestions and a plain "None" in the findings are all fine. If you cannot quote a false alarm of kind (a) or (b), the answer is PASS.`;

export function reviewCases(b) {
  const { regex, ledger, tool, llm, shared, noEdits, DONE } = b;
  const CITE = 'Cite `path:line` for each claim.';
  return REVIEW_TRUTHS.map((truth, index) => {
    const slug = `rev-${index + 1}`;
    const R = (file) => `.ambicode/reviews/${slug}/${file}`;
    const flags = `--ambicode-init --context${truth.policy ? ' --policy' : ''}`;
    const records = truthRecords(truth);
    const files = finalFiles(fixtureOf(truth));
    const report = R('1/report.txt');
    // The plugin arm's final message paraphrases the report and has dropped locations (review-subtle, 2026-10-17), so its locations and rubrics are read from the printed report.
    const graders = [
      tool('reviewer-invoked', 'Agent', 'ambicode:reviewer'),
      ledger('review-recorded', '"kind":"review"[^\\n]*"stage":"recorded"', R('ledger.jsonl')),
      DONE(R('ledger.jsonl')),
      ...noEdits,
    ];
    if (truth.control) {
      graders.push(
        ledger('no-high-risk-finding', '"risk"\\s*:\\s*"(high|medium)"', R('1/answer.json'), { match: 'not_contains' }),
        shared(llm('no-defect-claimed', NO_DEFECT(truth), { file: report }), llm('no-defect-claimed', NO_DEFECT(truth))),
      );
    } else {
      graders.push(ledger('finding-recorded', '"findings":[1-9]', R('ledger.jsonl'), { weight: 2 }));
      for (const record of records) {
        const pattern = issuePattern(record, files);
        const weight = record.main ? 2 : 1;
        graders.push(shared(ledger(`found-${record.id}`, pattern, report, { weight }), regex(`found-${record.id}`, pattern, { weight })));
      }
      graders.push(
        shared(llm('main-nature', NATURE(records[0].what), { file: report }), llm('main-nature', NATURE(records[0].what))),
        shared(llm('no-false-claim', NO_FALSE(truth, records), { file: report }), llm('no-false-claim', NO_FALSE(truth, records))),
      );
    }
    return {
      name: truth.name,
      description: `Local review of an uncommitted change on ${truth.base}.`,
      tags: ['review'],
      version: 2,
      fixture: fixtureOf(truth),
      flags,
      bareFlags: flags,
      prompt: `/ambicode:review --task ${slug} --headless --answer estimate=run ${CITE}`,
      bare: `Review the uncommitted change in this repository. ${CITE}`,
      graders,
      files: { 'review-truth.json': `${JSON.stringify(records, null, 2)}\n` },
    };
  });
}
