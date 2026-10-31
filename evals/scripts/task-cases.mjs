// The /ambicode:task cases. cases.mjs spreads `taskCases`.
//
// Two cases, cut from 22 on 2026-10-29 (the rest are archived in ../eval-archive/task-cases-2026-10-29): one after an investigation on the
// seedvault stack (a small change, the note and its ledger line seeded from task-seeds.mjs, its bare arm gets the note as prompt text) and one
// on the app fixture (a regression fix whose graders read the code and the ledger).
//
// Every expectation is read from the fixture as materialized (fixtures/definitions.mjs, init-stacks.mjs, app-medium.mjs); the stack
// fixture is materialized without --install, so its run has no runnable check and is graded on the code and the test file.
// Graders are regexes on the files the change touches and on the ledger, never a model reading a source file.
import { INVESTIGATIONS, seedFiles } from './task-seeds.mjs';

const T = (slug) => `.ambicode/tasks/${slug}/ledger.jsonl`;
// A headless request gets the review offer as a gate whose default skips it; naming the iteration keeps the review from running unasked.
const PROMPT = (slug, request) => `/ambicode:task --task ${slug} --headless iteration 1 ${request}`;
const GIT = 'git (commit|push|stash|reset|checkout|clean|merge|rebase)';
const REPORT = 'Task report[\\s\\S]*\\*\\*Done\\*\\*';
// check entries are written as {kind, key, files, exit, phase} (src/modules/checks/run/check-command.ts)
const GREEN = '"kind":"check"[^\\n]*"exit":0,"phase":"green"';

export function taskCases(B) {
  const { regex, ledger, never, exists, shared, DONE } = B;
  const file = (name, pattern, path, options = {}) => regex(name, pattern, { file: path, ...options });
  const sharedFile = (name, pattern, path, options = {}) => shared(file(name, pattern, path, options));
  const noGit = () => shared(never('no-git-mutation', 'Bash', GIT));
  // The final message of a plugin run is one pointer line: the report is the file the implementer's report is saved to, in the task directory.
  const report = (slug) => file('report-sections', REPORT, `.ambicode/tasks/${slug}/report.md`);
  // The task route's policy row (stage before-work, activity task) lists the rule ids delivered whole; a missing row means the rule never reached the change step.
  const delivered = (slug, id) => ledger(`policy-delivered-${id.split('/')[1]}`, String.raw`(?:^|\n)(?=[^\n]*"kind":"policy")(?=[^\n]*"activity":"task")(?=[^\n]*"ids":\[[^\]]*"${id}")`, T(slug));

  // A grader that reads the ledger or .ambicode/ cannot run without the plugin; the rest judges the code and the boundary in both arms.
  const sharedIfCode = (g) => (g.shared || g.text.includes('.ambicode/') ? g : shared(g));

  /** After an investigation: the plugin arm gets the note as files the route picks up, the bare arm as prompt text in plain words, no AMBICODE names. */
  const afterInvestigation = ({ name, slug, cited, fixture, description, request, graders, tags }) => ({
    name,
    description: `After an investigation: ${description}`,
    tags: ['task', 'seeded', ...tags],
    version: 1,
    fixture,
    flags: '--ambicode-init --context',
    prompt: PROMPT(slug, request),
    bare: `${request}\n\nAn earlier investigation of this code found the following; build on it.\n\n${INVESTIGATIONS[slug].trim()}`,
    files: seedFiles(slug, 'investigation', INVESTIGATIONS[slug]),
    graders: [
      DONE(T(slug)),
      // The map entry lists the paths an investigation cites, so a file only the note names shows it was read.
      ledger('investigation-picked-up', `"kind":"map"[^\\n]*${cited}`, T(slug)),
      noGit(),
      report(slug),
      ...graders.map(sharedIfCode),
    ],
  });

  // ---------------------------------------------------------------- jvm-gradle-seedvault (hexagonal Gradle build, Outcome results)
  const reportDir = 'application/src/main/kotlin/org/seedvault/application/usecase/report';
  const testRoot = 'application/src/test/kotlin/org/seedvault/application/usecase';
  const seedvault = [
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
  ];

  // ---------------------------------------------------------------- ts-app-medium: one task behaviour each, jest installed so the checks run
  const app = { flags: '--ambicode-init --context --install', version: 1 };
  const appCases = [
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
        report('segments-void'),
        noGit(),
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

  const TUNE = new Set(['task-jvm-after-investigate', 'task-app-segments-void']);
  // Files a correct change touches (relevant) and files it may touch without being wrong (allowed), scored on the workspace diff at
  // harvest (context.mjs changedFilesOf), not on what the answer names: the Evals view then shows R/P/F1 of the change itself.
  const CHANGED = {
    'task-jvm-after-investigate': { relevant: ['application/src/main/kotlin/org/seedvault/application/usecase/report/ViabilityBands.kt', 'application/src/test/kotlin/org/seedvault/application/usecase/report/ViabilityBandsTest.kt'], allowed: ['application/src/main/kotlin/org/seedvault/domain/lot/Viability.kt'] },
    'task-app-segments-void': { relevant: ['src/customers/segments.js', 'src/customers/statement.js', 'tests/customers/segments.test.js'], allowed: ['src/invoices/status.js', 'src/invoices/service.js', 'src/reports/top-customers.js', 'tests/customers/statement.test.js', 'tests/factory.js'] },
  };
  return [...seedvault, ...appCases].map((c) => (TUNE.has(c.name) ? { ...c, tags: [...c.tags, 'task-tune'], metrics: { source: 'changed', ...CHANGED[c.name] } } : c));
}
