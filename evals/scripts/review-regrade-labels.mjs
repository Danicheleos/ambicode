// Labelled findings for the offline matcher: [case, finding text, acceptable issue ids]. `[]` means the finding reports none of the
// known issues; a trailing `?` on an id (`main?`) means that id or none is acceptable. Taken from the audit probes of 2026-10-21
// (remarks that the regex graders credited to the wrong issue or missed), plus one paraphrase per truth issue (see labelledSet).
export const PROBE_LABELS = [
  ['review-go-swallowed-error', 'There is no test where Advance returns an error.', ['s2']],
  ['review-go-swallowed-error', 'Advance returns an error that is swallowed; a test would have caught it.', ['main']],
  ['review-py-error-codes', 'ingest is tested with a batch of three readings.', []],
  ['review-go-handler-bypass', 'BayHandler bypasses the planner; a test would have caught it.', ['main']],
  ['review-jvm-retire-rule', 'RetirementRules.check uses an inverted isBefore; a unit test would have caught it.', ['main']],
  ['review-py-peak-window', 'high_water_hours was retested on the latest data.', []],
  ['review-ts-boundary', 'chargeLateFees was retested and the latest build is green.', []],
  ['review-jvm-retire-rule', 'RetirementRules has no test.', ['s1']],
  ['review-mono-notes-html', 'addNote has no test.', ['s2']],
  ['review-ts-strategy', 'A unit test would catch a bad FeeStrategy.', []],
['review-jvm-lot-query','RetestReportService.kt:24 throws NoSuchElementException when no lot is due for retest; code base returns Outcome.Rejected',['s1']],
['review-jvm-lot-query','LotQueryBuilder.kt:8-18 is over-engineered: Specification, builder and a generic Repository for one caller',['main']],
['review-jvm-lot-query','No test covers RetestReportService or LotQueryBuilder',['s2']],
['review-jvm-lot-query','RetestReportService has no tests',['s2']],
['review-jvm-transfer-use-case','TransferLotService.kt:25 handle2 and tmp are meaningless names; latest contest attest',['s1']],
['review-jvm-transfer-use-case','TransferLotService has no test',['s2']],
['review-jvm-transfer-use-case','TransferLot.kt:11 declares fun execute where other ports use operator fun invoke',['main']],
['review-go-swallowed-error','scans_test.go:10 no test makes tracker.Advance return an error, so the 200 is never exercised',['s2']],
['review-go-swallowed-error','scans.go:36-38 the error from tracker.Advance is only logged and a 200 is returned',['main']],
['review-go-swallowed-error','scans.go:45 parseScanLine and scanStates duplicate the scanner package',['s1']],
['review-go-handler-bypass','server_test.go:21 nothing tests the /bays/ route',['s1']],
['review-go-handler-bypass','bays.go:14 BayHandler is not tested',['s1']],
['review-go-handler-bypass','bays.go:18 BayHandler.ServeHTTP assigns a bay (a write) on any method including GET',['s2']],
['review-go-handler-bypass','bays.go:34 BayHandler.Assign duplicates depot Planner.Assign and bypasses the depot service',['main']],
['review-go-wall-clock','sweep_test.go:12 uses year 2999 so the test never covers the real clock path',['main?']],
['review-go-wall-clock','sweep.go:12 time.Now used instead of injected core.Clock',['main']],
['review-go-wall-clock','sweep_test.go:12 only the happy path is tested: no parcel without scans and no store error',['s2']],
['review-jvm-retire-rule','RetirementRules.kt:11 the isBefore condition is inverted; a unit test would have caught it',['main']],
['review-jvm-retire-rule','RetireLotService.kt:25 and RetirementRules.check have no test',['s1']],
['review-py-peak-window','extremes.py:8 off-by-one: last interior hour is skipped in high_water_hours',['main']],
['review-py-peak-window','tests/test_peaks.py:12 unknown gauge reply is checked',[]],
['review-py-peak-window','tests/test_peaks.py:8 only first high water is asserted; high_water_hours is untested at the last hour',['s2']],
['review-py-peak-window','extremes.py:14 smooth is unused',['s1']],
['review-py-error-codes','plausibility.py:10 raises ImplausibleReadingError("jump") with no TW-nnn code',['main']],
['review-py-error-codes','limits.py:6 MAX_JUMP_MM comment says metres but the unit is mm',['s1']],
['review-py-error-codes','ingest.py:11 a late implausible reading in a batch leaves earlier readings stored (partial ingest)',['s2']],
['review-py-error-codes','plausibility.py:8 compares readings taken in a batch in ingest',[]],
['review-py-error-codes','limits.py:7 MAX_JUMP_MM has no unit test',[]],
['review-ts-strategy','strategy.ts:4 doc comments restate the names of the types',[]],
['review-ts-strategy','factory.ts:3 FeeStrategyFactory doc comment is redundant',[]],
['review-ts-strategy','return.ts:8 comments in returnItem narrate the next line',['s1']],
['review-ts-strategy','strategy.ts:11 FeeStrategy, LateFeeStrategy and FeeStrategyFactory are over-engineered indirection around lateFee',['main']],
['review-ts-strategy','factory.ts:7 hardcoded 50 duplicates CENTS_PER_LATE_DAY in late.ts',['s2']],
['review-ts-strategy','No tests cover FeeStrategyFactory or LateFeeStrategy',['s3']],
['review-ts-strategy','strategy.ts:20 LateFeeStrategy repeats the Math.max clamp that lateFee has',['s2']],
['review-ts-boundary','charge-late-fees.ts:2 imports lateFee from lending/domain past the index',['main']],
['review-ts-boundary','chargeLateFees has no test; only summarize is tested',['s2']],
['review-ts-boundary','charge-late-fees.ts:15 chargeLateFees bills what onLoanReturned already invoices, twice',['s3']],
['review-ts-boundary','charge-late-fees.ts:9 single-letter r and f names',['s1']],
['review-ts-boundary','chargeLateFees: batch grouping looks ok, see latest',[]],
['review-ts-weak-tests','borrow.test.ts:34 toBeTruthy is a weak assertion where the due date was checked',['main']],
['review-ts-weak-tests','no test asserts the loan-refused event is published',[]],
['review-ts-weak-tests','borrow.ts:18 event named loan-refused lacks the lending. prefix',['s1']],
['review-ts-weak-tests','routes.ts:15 429 is a rate limit status; a conflict 409 fits',['s2']],
['review-ts-weak-tests','policy.ts:3 MAX_OPEN_LOANS duplicates loanLimit by member tier',['s3']],
['review-ts-weak-tests','MAX_OPEN_LOANS boundary at 4 loans is not tested for a member',[]],
['review-mono-notes-html','firing.ts:12 note text unescaped into html: XSS',['main']],
['review-mono-notes-html','routes.test.ts:14 only lists routes; nothing posts a note or renders the page',['s2']],
['review-mono-notes-html','engine-api.ts:4 generated file edited by hand',['s1']],
['review-mono-notes-html','firingPage has no test for escaping of markup',['s2?']],
];

/** Every probe plus, per truth issue, its `what` as a reviewer would cite it. Items: `{case, text, accept: [id|null]}`. */
export function labelledSet(truths) {
  const items = PROBE_LABELS.map(([name, text, expected]) => {
    const optional = expected.some((id) => id.endsWith('?'));
    const ids = expected.map((id) => id.replace('?', ''));
    return { case: name, text, accept: optional ? [...ids, null] : ids.length === 0 ? [null] : ids };
  });
  for (const [name, records] of truths) for (const record of records) {
    items.push({ case: name, text: `${record.locations[0].file}:${record.locations[0].lines[0]} ${record.what}`, accept: [record.id] });
  }
  return items;
}
