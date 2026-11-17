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
    // slug pinned: the retire-rule case sat before this one at rev-4, and the dropped case must not renumber the kept one's task.
    name: 'review-mono-clean-rust', slug: 'rev-5', n: 2, base: 'monorepo-rust-ts-kiln', topic: 'clean-rust', policy: true, control: true,
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
    const slug = truth.slug ?? `rev-${index + 1}`;
    const R = (file) => `.ambicode/reviews/${slug}/${file}`;
    const flags = `--ambicode-init${truth.policy ? ' --policy' : ''}`;
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
