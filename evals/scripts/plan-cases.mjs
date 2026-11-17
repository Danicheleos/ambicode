// The /ambicode:plan cases: one on ts-app-medium-plan (a vague request). cases.mjs spreads
// `planCases`; PLAN_SPECS is also what plan-cases.test.mjs reads, so every file a check names is verified against the fixture.
//
// Both arms are asked for the plan as their answer and graded on the same artefact: the plugin's plan.md, the bare arm's
// final message. Checks on the plan's content are shared regexes over that text: files that must or must not appear, never wording.
// `sample` is a line of a good plan that the pattern must match, with real `path:line` anchors the test resolves in the fixture;
// for a `mustNot` entry it is a line the pattern must catch, and `ok` a line it must let through.

import { fixtureByName } from '../../fixtures/definitions.mjs';

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
// Without a call paren: the model names the helper in backticks ("\`makeInvoice\` with a dueDate"), and a regrade of the 2026-10-26 runs found that form missed.
const FACTORY = String.raw`tests/factory\.js|\bmake(Invoice|Customer|Payment)\b|\b[Ff]actory\b`;
// The app plan variant's existing due-date mechanism and Finance's definition of overdue (src/invoices/terms.js, src/config.js).
// Not paymentTermsDays: a plan that never opened terms.js invents that name (the bare remind plan of 2026-10-23 did).
const TERMS = String.raw`dueDateFor|terms\.js`;
const GRACE = String.raw`overdueGraceDays`;
// Checks that need two facts joined, not one name found (each v2 plan found every name and still missed these):
// Finance's day is clock.businessDay (docs/architecture.md, Days); every v2 plan counted overdue in clock.today().
const BUSINESS_DAY = String.raw`businessDay|Europe/Berlin|config\.timeZone`;
// Where the due date comes from is a decision the plan must make aloud: kept on the invoice at create (the back office can change a
// customer's terms later, customers/patch.js, so a day derived again is not the day the mail printed), or derived from the terms
// (dueDateFor, terms.js). The request names neither. Not planned(): "not stored; derived from terms" is a decision too. All twelve
// plans of 2026-10-26 (plugin and bare) derived it; a plan that reads invoice.dueDate and says nothing about its source fails.
const DUE_DAY = String.raw`(dueDate|[Dd]ue ?[Dd]ate|[Dd]ue day|pay-by day)\b`;
const DERIVE = String.raw`\b(deriv|comput|calculat)\w*`;
const DUE_DECIDED = String.raw`\b(stor|persist)\w*${LINE}{0,80}${DUE_DAY}|${DUE_DAY}${LINE}{0,80}(\b(stor|persist)\w*|on the invoice(?! mail)|createInvoice|invoices/model|${DERIVE}|from (the )?(customer'?s? )?(payment )?terms)|${DERIVE}${LINE}{0,80}${DUE_DAY}|(createInvoice|invoices/model\.js)${LINE}{0,120}dueDate\b|dueDateFor|terms\.js`;
// The vague request: noticing that an invoice carries no due date today, said as absence, as "derived/printed, not stored", or by
// computing it from issuedAt (three of the 2026-10-26 plugin plans never said it outright; dueDateFor(issuedAt, ...) shows they knew).
const NO_DUE_DATE = String.raw`(no|not|without|lacks?|missing|has none|does not (have|carry|store)|doesn't|never)[^\n]{0,60}([Dd]ue ?[Dd]ate|dueDate|due day)|([Dd]ue ?[Dd]ate|dueDate|due day)[^\n]{0,120}(not|isn't|is never|n't be) stored|${DUE_DAY}${LINE}{0,120}${DERIVE}|${DERIVE}${LINE}{0,80}${DUE_DAY}|(dueDateFor|terms\.js)${LINE}{0,160}(mail|print\w*|not (a )?(field|column|stored|persisted)|never stored)|dueDateFor\([^)\n]{0,60}issuedAt`;

/**
 * A `mustNot` pattern that flags `pattern` only where the plan proposes changing that file: a bullet that opens with the path (the
 * Changes entries); a verb earlier on the line does not count (2026-10-26 ts-grace: "add MembersApi ... as CatalogApi at catalog/index.ts:8"). A file cited as the pattern to mirror or as a fact ("Style follows
 * billing/on-loan-returned.ts:6-9", the 2026-10-23 ts-grace and ts-reserve plans) is not planned work, nor is anything under a
 * findings heading ("What the code lacks or already settles", Assumptions, Open decisions) until the next Iteration heading (the
 * mono-calibrate bullet "__generated__/engine-api.ts:1 says it is generated ... not edited by hand").
 */
const FINDINGS_SECTION = String.raw`(?<=(?:^|\n)#+ *(?:What the code|Findings|Assumptions|Open decisions)[^\n]*\n(?:(?!#+ *Iteration)[\s\S])*)`;
const changes = (pattern) => String.raw`(^|\n|\\n)(?!${FINDINGS_SECTION})\s*(?:[-*]|\d+[.)]|\|)\s*[*_\x60]*[\w/.-]*?(?:${pattern})`;

const both = (a, b) => `${a}[\\s\\S]*${b}|${b}[\\s\\S]*${a}`;

export const PLAN_SPECS = [
  // ---------------------------------------------------------------- stack fixtures

  // ---------------------------------------------------------------- ts-app-medium-plan
  // The app cases run on the plan variant (APP_PLAN in fixtures/app-medium.mjs): payment terms that print a pay-by day nobody
  // stores and the back office can change per customer, Finance's overdue grace and time zone, a PATCH whitelist, an invoice
  // page view, CSV download helpers, a gateway cache on /reports, a refund event with no customerId and a test that keeps
  // src/notifications from requiring invoices. `policy-` checks grade CONTRIBUTING.md.
  // Weights: 3 for a check that needs two facts joined, 2 for an existing mechanism to find, 1 for the rest. The v2 run
  // passed every weight-1 check in all nine plans, so they only set the floor.
  {
    name: 'plan-app-vague', slug: 'plan-app-vague', fixture: 'ts-app-medium-plan', size: 'narrow', version: 4,
    weights: { 'due-date-decided': 2, 'business-day': 2, 'terms-found': 2, 'overdue-rule-found': 2 },
    request: 'Late payers are a mess for us. Make the billing service handle them better.',
    description: 'A vague request: invoices store no due date though the mail prints one from terms the back office can change, Finance has an overdue grace and a time zone, the aging report counts from the issue date and a reminders flag is off; the plan has to ground itself in that and say what it assumed.',
    must: [
      ['no-due-date-noticed', NO_DUE_DATE, 'invoices carry no dueDate today (src/invoices/model.js:3)'],
      ['terms-found', TERMS, 'the invoice mail prints a pay-by day from dueDateFor (src/invoices/terms.js:6) that is never stored'],
      ['due-date-decided', DUE_DECIDED, 'the plan says where the due date comes from: stored on the invoice at create, or derived from the customer\'s terms (src/invoices/terms.js:6)'],
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
];

/** The text a good plan for `spec` would hold: every positive sample, plus enough `Goal` headings for its iterations. */
export const goodPlan = (spec) => [...spec.must.map(([, , sample]) => sample), ...Array(spec.iterations ?? 1).fill('Goal: one iteration')].join('\n');

/**
 * A plan-quality pattern that cannot start inside the plan's `## Policies` section: its citation lines name files and rules too
 * ("applied at src/notifications/service.js:27-38, src/invoices/service.js:81" tripped a feature-boundary check in the 2026-10-26 remind run).
 */
export const outsidePolicies = (pattern) => String.raw`(?<!## Policies[\s\S]*)(?:${pattern})`;

/** One policy ledger row of an activity whose `ids` hold an id matching `id` (a regex source); fields are looked up in any order. */
export const stagedRow = (activity, id) => String.raw`(?:^|\n)(?=[^\n]*"kind":"policy")(?=[^\n]*"activity":"${activity}")(?=[^\n]*"ids":\[[^\]]*"${id})`;

// A citation line of the plan's Policies section: `<pack-id>/<rule-id>: applied at …` or `: not applicable: …`, id optionally bulleted or in backticks.
const CITE_ID = String.raw`[-*\s\x60]*([a-z]+-[a-z]+/[\w-]+)[\x60*_]*`;
const CITES = String.raw`(?:^|\n)${CITE_ID.replace('(', '(?:')}: (?:applied at|not applicable)`;
const CITED_TWICE = String.raw`(?:^|\n)${CITE_ID}: [^\n]*\n(?:[^\n]*\n)*?${CITE_ID.replace(/\(.*?\)/, '\\1')}: `;

/**
 * Graders of the policy citations every plan owes, generic over the case: plan-check is the one place that knows which delivered rules
 * the plan's Changes paths reach, so the ledger row of a passing check is the proof that each was cited and none twice; the text graders
 * catch a plan that cites nothing or an id on two lines even when the check never ran. Weight 1 each, against 2 for a trap and the rubric.
 * `stackPacks` (the fixture's) adds a check that the stack rules reached the plan stage at all.
 */
export function citationGraders({ regex, ledger }, { at, ledgerFile, stackPacks = [] }) {
  const stack = stackPacks.map((ref) => ref.replace(/^builtin\//, '')).join('|');
  return [
    regex('plan-cites-its-rules', CITES, { file: at }),
    regex('plan-cites-each-rule-once', CITED_TWICE, { file: at, match: 'not_contains' }),
    ledger('plan-check-passed', String.raw`"worker":"plan-check"[^\n]*"summary":\{"failed":false`, ledgerFile),
    ...(stack === '' ? [] : [ledger('plan-gets-stack-rules', stagedRow('plan', `(?:${stack})/`), ledgerFile)]),
  ];
}

export function planCases({ regex, ledger, never, exists, llm, shared, DONE }) {
  // The one plan file is plan.md in the task folder: `status: draft` until an Accept, `status: accepted` after it.
  const body = (slug) => `.ambicode/tasks/${slug}/plan.md`;
  const T = (slug) => `.ambicode/tasks/${slug}/ledger.jsonl`;
  // Source and test directories of every fixture; the plan route itself writes only below .ambicode/.
  const WRITE_SOURCE = String.raw`"file_path":"[^"]*/(src|tests?|internal|cmd|engine|dashboard|tools|domain|application|adapters|bootstrap)/`;
  // A plan-check row with no bad anchor: the first check, or the one after the fix round.
  const checked = (slug) => [ledger('anchors-valid', '"worker":"plan-check"[^\\n]*"anchorsBad":0', T(slug))];
  // The one Edit the route allows is the fix of its own plan file after a failed check.
  const NOT_PLAN_BODY = String.raw`"file_path":"(?![^"]*/\.ambicode/tasks/[^"/]+/plan\.md")`;

  return PLAN_SPECS.map((spec) => {
    const { slug } = spec;
    const at = body(slug);
    // A trap check (an existing mechanism a skim misses) weighs 2, so missing two or three of them costs a plan about 0.2.
    const weightOf = (name) => spec.weights?.[name] ?? 1;
    const planText = (name, pattern, match = 'contains') => shared(regex(name, outsidePolicies(pattern), { file: at, match, weight: weightOf(name) }), regex(name, pattern, { match, weight: weightOf(name) }));
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
    const stackPacks = fixtureByName(spec.fixture).stackPacks ?? [];
    const flags = stackPacks.length > 0 ? '--ambicode-init --stack-packs' : '--ambicode-init';
    const citations = stackPacks.length > 0 ? citationGraders({ regex, ledger }, { at, ledgerFile: T(slug), stackPacks }) : [];
    const base = { name: spec.name, description: spec.description, tags: ['plan', spec.size], version: spec.version ?? 1, fixture: spec.fixture, flags, ...(spec.limits ? { limits: spec.limits } : {}) };

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
        ...citations,
        DONE(T(slug)),
        ...iterationGraders,
        ...content,
        ...boundary,
      ],
    };
  });
}
