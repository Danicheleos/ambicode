// Plan -> task chain cases: one real k12 ticket, two plugin-arm cases run one after the other, each its own invocation and sandbox, plus the bare arm.
//   stage 1  `<name>-chain-plan`  /ambicode:plan with the accepted answer; its plan.md is graded.
//   stage 2  `<name>-chain`       /ambicode:task on the task folder a finished stage 1 run left (generated from its result stamp).
//   bare     `<name>-chain`       the raw ticket once. No review stage (user decision).
//   stage 1 inv  `<name>-chain-plan-inv`  stage 1 on the ticket's `investigationFile` note seeded in the sandbox (slug `<slug>ci`); plugin arm only, no bare, no stage 2.
//   <bench env vars named in the local file> node evals/scripts/chain-cases.mjs [--evals evals] [--cases <file>]     (stage 1 and bare)
//   node evals/scripts/chain-cases.mjs --from-stamp <stamp> [--from-stamp <stamp> ...] [--evals evals] [--cases <file>]   (stage 2; the bench env vars too)
// Writes into evals/cases/task-chain/ and evals/bare/task-chain/, both gitignored like task-real/: the scaffold names the local bench checkout.
//
// Why two cases and not one prompt: `claude plugin eval` takes one prompt.md per case and runs every case in its own temp sandbox (-j 4,
// deleted by harvest), and the plan route's closing forbids further route calls after plan; skills have no automatic transition by design.
// Stage 2 therefore starts from the harvested `.ambicode/tasks/<slug>/` of a stage 1 run, seeded into the
// sandbox by scaffold.sh the way task-real's `-plan` variants seed their plan (scaffold seeded: true).
//
// The code-side graders are the task cases' own (real-cases.mjs graderFiles, slug renamed to the chain's), so a chain score is comparable
// with `task-real-k12-celery-email-plan` and `task-real-k12-recognition-notifications`. The plan-side graders are regexes over the accepted
// plan.md, written from the ticket's own sentences (PLAN_VALUES), never from a run's plan or from the reference plan.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveOf } from './context.mjs';
import { scaffold } from './downstream-cases.mjs';
import { NO_RUNS, graderFiles, loadRealCases } from './real-cases.mjs';
import { seedFiles } from './task-seeds.mjs';

const EVALS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHAIN_TAG = 'task-chain';
export const chainName = (name) => `${name}-chain`;

// Plan cases run max_turns 30 / 900 s (cases.mjs `plan`); the task stage is the task cases' own 60 / 1500.
const PLAN_LIMITS = { max_turns: 30, timeout_seconds: 900 };
const TASK_LIMITS = { max_turns: 60, timeout_seconds: 1500 };
export const planName = (name) => `${chainName(name)}-plan`;

/** Makes a pattern case-insensitive without inline flags (the harness regex flavour is not known): each letter outside an escape becomes a class. Patterns must hold no letters inside [...]. */
export const ci = (pattern) => pattern.replace(/\\.|[a-zA-Z]/g, (m) => (m.length === 2 ? m : `[${m.toLowerCase()}${m.toUpperCase()}]`));
const all = (...parts) => `^${parts.map((part) => `(?=[\\s\\S]*(?:${ci(part)}))`).join('')}`;
const near = (a, b, gap = 160) => ci(`(?:${a})[^\\n]{0,${gap}}(?:${b})|(?:${b})[^\\n]{0,${gap}}(?:${a})`);
// Orderless proximity without flags: from any start position every part must occur within `gap` characters (`[^\n]` keeps it on one line, `[\s\S]` lets it cross lines).
// The harness regex flavour is not known, so no lookbehind and no inline flags. Parts are matched case-insensitively and may carry word boundaries.
const close = (gap, newline, ...parts) => `(?:${parts.map((part) => `(?=${newline ? '[\\s\\S]' : '[^\\n]'}{0,${gap}}?(?:${ci(part)}))`).join('')})`;
const sameLine = (gap, ...parts) => close(gap, false, ...parts);
const within = (gap, ...parts) => close(gap, true, ...parts);
/** Every pattern (already case-folded) must match somewhere in the file. */
const both = (...patterns) => `^${patterns.map((pattern) => `(?=[\\s\\S]*?(?:${pattern}))`).join('')}`;

// Plan-value patterns. Plans write values as identifiers (new_recognition, CELERY_BROKER_URL, task_always_eager, triggered_by_employee_id) and spread the
// facts of one ticket sentence over several lines. `\b` does not split at `_` (a word character), so `\bbroker\b` missed CELERY_BROKER_URL and `\beager\b` missed
// task_always_eager; and one regex wanting several facts on one line missed plans that state them in separate bullets (regrade of the archived chain plans: 7 of
// the 22 value graders failed on values the plan holds). A value is bounded by any non-alphanumeric character (`_`, `-`, `.`, `/`, backticks, line edges) and a
// grader with several independent facts requires each fact somewhere in the file (`facts`). The harness runs these as JS regexes (the trace graders already use
// lookbehind, see wroteLine). Case folding stays the `ci` class trick, applied before the boundary classes (which hold letters) are added.
const NB = (pattern) => `(?<![A-Za-z0-9])(?:${ci(pattern)})(?![A-Za-z0-9])`;
/** Every fact (each already bounded by NB) must occur somewhere in the file, in any order, over any number of lines. */
const facts = (...patterns) => `^${patterns.map((pattern) => `(?=[\\s\\S]*?${pattern})`).join('')}`;
/** One relation between two values: either order, within `gap` characters of one line (a phrase: "interface ... unchanged"), or of one block with no blank line between (a bullet list under its lead-in). */
const relOf = (between) => (gap, a, b) => `(?:${NB(a)}${between}{0,${gap}}?${NB(b)}|${NB(b)}${between}{0,${gap}}?${NB(a)})`;
const rel = relOf('[^\\n]');
const relBlock = relOf('(?:(?!\\n\\n)[\\s\\S])');

/** The plan must say it was accepted: the draft route writes `status: draft` and the promote step flips it (routes/plan/plan.yaml). */
const ACCEPTED = { name: 'plan-accepted', pattern: '^[-]{3}\\n(?:[^\\n]*\\n){0,10}?status:[ \\t]*accepted', ticket: 'the plan case runs the plan with --answer plan-accept=Accept' };

// Every concrete value the ticket fixes, with the ticket's sentence it comes from (paraphrased to the clause).
export const PLAN_VALUES = {
  'task-real-k12-celery-email': [
    { name: 'plan-celery-on-sqs', pattern: all('celery', '\\bsqs\\b'), ticket: 'Move it to background processing with Celery on an SQS queue' },
    { name: 'plan-five-email-kinds', pattern: all('registration', 'forgot[ _-]?password', 'invit', 'bulk', 'single|send_recognition_email|recognition[ _-]email'), ticket: 'registration, forgot password, invitations, single and bulk recognition emails' },
    { name: 'plan-one-task-per-kind', pattern: ci('(?:own|dedicated|separate|each|every|per|one)[^\\n]{0,40}tasks?|tasks?[^\\n]{0,40}(?:per|for each|each|every)[^\\n]{0,20}(?:kind|type|email)'), ticket: 'each kind of email gets its own task' },
    { name: 'plan-interface-kept-returns-after-queueing', pattern: facts(rel(120, 'interfaces?|\\w*protocols?|signatures?|methods?|api|send_\\w+', 'same|unchanged|kept?|keeps?|stays?|remains?|retains?|preserv\\w+|existing|not chang\\w+|(?:no|not|without)[^\\n]{0,15}(?:callers?|call sites?)[^\\n]{0,15}chang\\w*'), NB('queue(?:d|s)?|queuing|queueing|enqueue(?:d|s)?|delay|apply_async')), ticket: 'Code that sends emails must keep calling the same email interface and return immediately after the job is queued' },
    { name: 'plan-worker-delivers-mock-local-test-ses-elsewhere', pattern: facts(NB('workers?'), NB('mock\\w*'), NB('local(?:ly)?'), NB('test(?:s|ing)?'), NB('ses')), ticket: 'delivery happens in a separate worker; mock client in local and test, real SES client elsewhere' },
    { name: 'plan-payload-json-validated', pattern: all('json', 'validat|pydantic|schema|typed'), ticket: 'Task payloads must be JSON-serializable and validated' },
    { name: 'plan-failures-logged-retry-by-visibility-timeout', pattern: both(ci('visibility[ _-]timeout'), ci('\\blog(?:s|ged|ging)?\\b')), ticket: 'failed deliveries must still be logged and are retried according to the queue\'s visibility timeout' },
    { name: 'plan-eager-in-test-environment', pattern: facts(NB('eager(?:ly)?|immediately|same process|in[ -]process'), NB('test(?:s|ing)?'), NB('(?:without|no|not (?:need|require)\\w*)[^\\n]{0,30}brokers?|brokers?[^\\n]{0,30}(?:not (?:needed|required)|unneeded)|(?:task_)?always_eager')), ticket: 'In the test environment tasks must execute immediately in the same process, without a broker' },
    { name: 'plan-broker-queue-from-settings-localstack-defaults', pattern: facts(NB('settings?|config(?:uration)?'), NB('brokers?'), NB('queues?'), NB('localstack'), NB('default(?:s|ing|ed)?')), ticket: 'broker address and queue location come from the application settings, with defaults for LocalStack' },
    { name: 'plan-daily-1400-utc-only-logs', pattern: both(within(250, '14:00|\\b1400\\b|\\bhour\\W{0,4}14\\b', '\\butc\\b', '\\bdaily\\b|\\bevery day\\b', '\\blog(?:s|ged|ging)?\\b')), ticket: 'a scheduled job that fires every day at 14:00 UTC and for now only logs that the daily report was triggered' },
    { name: 'plan-dependency-worker-scheduler-container', pattern: all('dependenc|pyproject', 'worker', 'scheduler|beat', 'docker|container|compose'), ticket: 'Add the dependency, and make the local environment and container setup able to run the worker and the scheduler' },
  ],
  'task-real-k12-recognition-notifications': [
    { name: 'plan-fields-listed', pattern: all('initiator|triggered by|\\bactor\\b|\\bsender\\b|triggered_by', '\\breceiver\\b|\\brecipient\\b', '\\btitle\\b|\\bheading\\b|\\bsubject\\b', '\\bdescription\\b|\\bbody\\b', 'action[ _-]?(?:text|label)|button (?:text|label)', 'action[ _-]?(?:link|url|href)', 'is_read|read flag|read[ _-]status|\\bread\\b|\\bseen\\b', '\\bcreated\\b|created_at|creation (?:time|date)'), ticket: 'records who triggered it, who receives it, a title, a description, the action text, the action link, whether it has been read and the time it was created' },
    { name: 'plan-initiator-may-be-empty', pattern: rel(160, 'initiator|triggered[ _-]?by', 'nullable|empty|set[ _-]?null|on[ _-]?delete|optional|none'), ticket: 'who triggered it (this may become empty if that employee is later removed)' },
    { name: 'plan-unread-at-first', pattern: near('is_read|read flag|\\bread\\b', 'default|false|unread|initially|at first', 120), ticket: 'whether it has been read (unread at first)' },
    { name: 'plan-five-kinds', pattern: facts(NB('recognitions?'), NB('unresolved|issues?'), NB('templates?'), NB('overdue'), NB('remind(?:er|ers)?')), ticket: 'kinds: new recognition, unresolved issues, a new rounding template, an overdue template and a rounding reminder' },
    { name: 'plan-builder-per-kind-apart-from-storage', pattern: all('per[ -]kind|each kind|every kind|one (?:builder|factory)|own (?:builder|place|module|class|factory)|builder for each', 'storage|repository|store|sending|send'), ticket: 'the building of notifications for each kind must live in its own place so a new kind can be added without touching the code that stores and sends notifications' },
    { name: 'plan-action-links-to-recognition-in-frontend', pattern: both(sameLine(200, '\\bfront-?end\\b|\\bweb\\b', '\\blinks?\\b|\\burl\\b', '\\brecognitions?\\b')), ticket: 'an action that links to that recognition in the web frontend' },
    { name: 'plan-draft-notifies-nobody', pattern: near('draft', '\\bnot?\\b|nobody|no one|never|without|does not|must not', 120), ticket: 'A draft must not notify anyone' },
    { name: 'plan-publish-notifies-only-drafts-once', pattern: all('publish', 'twice|again|duplicate|re-?notif|already published|were (?:still )?drafts?|still (?:a )?drafts?|before (?:saving|they|it)'), ticket: 'notifications are created when drafts are published, only for the recognitions that were drafts at that moment, so publishing an already published recognition never notifies twice' },
    { name: 'plan-one-per-recipient', pattern: ci('(?:one|each|per|every)[^\\n]{0,40}(?:recipient|receiver)|per[ -](?:recipient|receiver)|(?:recipient|receiver)[^\\n]{0,40}(?:one|each)'), ticket: 'Recognizing several people at once produces one notification per recipient' },
    { name: 'plan-migration', pattern: all('migration|alembic'), ticket: 'Persist notifications in the database with a migration' },
    { name: 'plan-tests-cover-both-paths', pattern: facts(relBlock(500, 'tests?|cover(?:s|ed|age)?', 'drafts?|publish\\w*|send[ _-]and[ _-]save'), relBlock(500, 'tests?|cover(?:s|ed|age)?', 'direct(?:ly)?|non[ _-]?draft|not (?:a )?draft|without (?:a )?draft')), ticket: 'cover both paths (direct recognition and publishing drafts) with tests' },
  ],
  // The suite's k12 tickets: stage 1 is graded on plan-accepted alone (user decision 2026-11-02: no value graders), so their lists are empty.
  'task-k12-1016': [],
  'task-k12-1094': [],
  // The suite's FE tickets (same rule, appended last so the k12 chain directory numbers above stay).
  'task-real-fe-vs-5945-nom-admin-defaults': [],
  'task-real-fe-vs-6545-reba-submit': [],
  'task-real-fe-vs-5915-ge-adv-autolaunch': [],
};

/**
 * Chain-only replacements of the task case's diff graders, by case and grader name; everything else in a diff grader (in, match, weight) stays the case's own.
 * `tasks-deliver-email` asked for a task decorator and `Ses|Client` among the ADDED lines, so a run that did what the ticket wants and left the existing sender
 * alone (the task calls the untouched `get_email_repo()`, the one that already holds the SES or mock client) failed it: nothing it left as it was shows in a diff of added
 * lines (archived chain run 2026-10-31T11-46-59-220Z: tasks decorated, `get_email_repo().send_registration_email(` called, grader 0). The task module is always new
 * code, so its added lines are its final content; delivery is a call into the sender or the client from the task, not the word SES.
 * `mock-client-kept-for-local-and-test` gets `keptIf` (diff-graders.mjs gradeOne): leaving the selection alone leaves nothing among the added lines.
 * Both match a task and its delivery call in one file (`perFile`): a decorator in one file and a call in another is not a delivering task. Value graders over plan.md check presence
 * anywhere in the file; scattered or negated mentions pass (accepted 2026-10-31).
 */
const TASKS_DELIVER = '^(?=[\\s\\S]*(?:\\.task\\b|shared_task|\\w+_task\\())(?=[\\s\\S]*(?:get_email_repo\\(|\\.send_\\w*email\\w*\\(|\\w*(?:ses|email)_client\\b|boto3\\.client|SESClient\\w*|\\bSes\\w*Client))';
const TASK_VIA_SELECTOR = '^(?=[\\s\\S]*(?:\\.task\\b|shared_task|\\w+_task\\())(?=[\\s\\S]*get_email_repo\\()';
export const DIFF_GRADER_OVERRIDES = {
  'task-real-k12-celery-email': {
    'tasks-deliver-email': { pattern: TASKS_DELIVER, perFile: true, ticket: 'Move it to background processing with Celery on an SQS queue ... the actual delivery happens in a separate worker process' },
    // The old pattern (mock and Env.test|local among the added lines) failed a run that kept `get_email_repo()` as it was (archived chain run
    // 2026-10-31T11-46-59-220Z: its plan says "the worker reuses it unchanged"; email_repo.py's diff only drops the module-level email_repo). Added lines still pass it
    // (the reference moves the selection into the task module); keptIf adds: a task delivers through the existing selector (a direct boto3 client is not the selector) AND
    // email_repo.py (where get_email_repo selects the mock) lost no mock or env line it did not add back.
    'mock-client-kept-for-local-and-test': { keptIf: { perFile: true, added: TASK_VIA_SELECTOR, removed: 'Env\\.(?:test|local)|[Mm]ock', in: '^src/adapters/repositories/email_repo\\.py$' }, ticket: 'keeps the existing behaviour of using a mock client in local and test environments and the real SES client elsewhere' },
  },
};

/**
 * Marks a grader file plugin-only: `arm: with-only` in the frontmatter (the harness's grader schema is strict and has no `with_only` key;
 * the old key made `claude plugin eval` 2.1.312 reject the case: "graders.4: Unrecognized key(s): 'with_only'"). The harness sets
 * `withOnly: true, scored: false` on such a grader only under with-without ablation; our runs use `--ablation none`, so run.mjs
 * (withOnlyNamesOf, markWithOnly) drops them from the score itself. The pass/fail stays in the run's graders list. Without it the plugin
 * arm's score had 14 more graders (plan-picked-up, route-done, plan-accepted and 11 value graders per ticket) than the bare arm can have.
 */
export const withOnly = (text) => text.replace(/^---\n/, '---\narm: with-only\n');

/**
 * The task route's own exit, not the plan's: the chain's ledger is shared, and an exit done of the plan route alone passed the old route-done (any exit done).
 * Real ledger lines (archived celery run): the route start is `{"id":"20",...,"kind":"route","skill":"task",...}` and its exit is
 * `{"id":"47",...,"route":"20","kind":"exit","reason":"done",...}`; an exit carries the start's id in `route`, never the skill name. The previous pattern
 * required `"route":"task"` on the exit line and so never matched. The backreference ties the exit to the task start (the seed's plan exit is `"route":"1"`).
 */
export const TASK_DONE = '\\{"id":"(\\d+)"[^\\n]*"kind":"route","skill":"task"[\\s\\S]*"route":"\\1","kind":"exit","reason":"done"';

const PLUGIN_ONLY_OLD = new Set(['plan-picked-up', 'route-done']);

/** Plugin-only graders of the chain: plan picked up, task route finished. Non-scoring, see withOnly. */
export function routeGraders(real) {
  const ledger = `{ source: file, path: .ambicode/tasks/${real.slug}/ledger.jsonl }`;
  const regex = (name, pattern) => ({ name, text: withOnly(`---\ntype: regex\npattern: ${y(pattern)}\nmatch: contains\ntarget: ${ledger}\nweight: 1\n---\n`) });
  return [regex('plan-picked-up', `"planPath":".ambicode/tasks/${real.slug}/plan\\.md","iteration":1`), regex('task-done', TASK_DONE)];
}

/** Harness graders over the accepted plan.md, from PLAN_VALUES plus the accepted-status one. Non-scoring: the bare arm has no plan. */
export function planGraders(real) {
  const file = `.ambicode/tasks/${real.slug}/plan.md`;
  const y = (value) => `'${String(value).replace(/'/g, "''")}'`;
  return [ACCEPTED, ...PLAN_VALUES[real.base]].map((g) => ({ name: g.name, text: withOnly(`---\ntype: regex\npattern: ${y(g.pattern)}\nmatch: contains\ntarget: { source: file, path: ${file} }\nweight: 1\n---\n`) }));
}

const oneLine = (text) => text.replace(/\s+/g, ' ').trim();
const y = (value) => `'${String(value).replace(/'/g, "''")}'`;

/** The chain variant of a local real case: its slug, the task-side graders of the plan variant, the `-chain` name. */
export const chainOf = (real, order) => ({ ...real, base: real.name, name: chainName(real.name), slug: `${real.slug}c`, variant: 'plan', order });

/** The task stage request: the task-real wording, quoted so the hook parser keeps it whole. */
const CHAIN_GO = 'Go ahead with the plan. Do not run builds, tests, linters or reviews.';

/**
 * Stage 1 prompt. It begins with the typed command: only the UserPromptSubmit hook starts plan from a prompt that begins
 * `/ambicode:plan` (src/hook/events/prompt-launch.ts LAUNCH), and only that channel is trusted, so `--answer plan-accept=Accept` is
 * honoured; the same route started by the model through the CLI is untrusted and the answer is declined (engine.ts `trusted = channel !== 'cli'`),
 * leaving the plan a draft. Nothing follows the ticket: the route closing forbids further route calls after plan.
 */
export const planPrompt = (real) => `/ambicode:plan --task ${real.slug} --headless --answer plan-accept=Accept ${oneLine(real.prompt)}`;
/** Stage 2 prompt: the task route on the folder stage 1 left (seeded by scaffold.sh), same request wording as task-real. */
export const taskPrompt = (real) => `/ambicode:task --task ${real.slug} --headless "${CHAIN_GO}"`;
/** The bare prompt: the raw ticket once, as the task-real raw variant's bare arm has it. */
export const barePrompt = (real) => `${oneLine(real.prompt)}\n\n${NO_RUNS}`;

/** A finished stage 1 run's `.ambicode/tasks/<slug>/` as `{ 'seed/tasks/<slug>/<file>': text }`, ready for the stage 2 case. */
export function seedOf(folder, slug) {
  const plan = path.join(folder, 'plan.md');
  if (!existsSync(plan) || !/^---\n(?:[^\n]*\n){0,10}?status:[ \t]*accepted/.test(readFileSync(plan, 'utf8'))) throw new Error(`${folder}: no accepted plan.md (the stage 1 run did not finish)`);
  const files = {};
  const walk = (relative) => {
    for (const entry of readdirSync(path.join(folder, relative))) {
      const child = path.join(relative, entry);
      if (statSync(path.join(folder, child)).isDirectory()) { walk(child); continue; }
      // report.md and summary.md are written by the task route; a real stage 1 run has neither, a one-prompt run (2026-10-31) had both.
      // Stamped notes (result_<stamp>.md: the Stop hook saves the run's final message; changed_<stamp>.md) are products of the run that wrote them; k12 chain seeds carried "Done.".
      if (child === 'report.md' || child === 'summary.md' || /^(?:result|changed)_[^/\\]+\.md$/.test(child)) continue;
      files[`seed/tasks/${slug}/${child.split(path.sep).join('/')}`] = readFileSync(path.join(folder, child), 'utf8');
    }
  };
  walk('');
  // A stage 1 ledger ends at the plan route's exit; a one-prompt run's carried the task route after it, which would put a finished task route in the seed.
  const ledgerKey = `seed/tasks/${slug}/ledger.jsonl`;
  const lines = (files[ledgerKey] ?? '').split('\n');
  const exit = lines.findIndex((line) => line.includes('"kind":"exit"'));
  if (exit < 0) throw new Error(`${folder}: the ledger has no route exit (the stage 1 run did not finish)`);
  files[ledgerKey] = `${lines.slice(0, exit + 1).join('\n')}\n`;
  return files;
}

/** `<archive>/.../traces/plugin/<stamp>/*.ambicode/.ambicode/tasks/<slug>` of the stamp's runs, as run.mjs harvests them (archiveOf of the traces dir), or null. */
export function harvestedTaskFolder({ stamp, slug, evalsDir = EVALS, env = process.env }) {
  const runs = archiveOf(path.join(evalsDir, 'cases', 'results', 'traces', 'plugin', stamp), env);
  for (const entry of existsSync(runs) ? readdirSync(runs) : []) {
    const folder = path.join(runs, entry, '.ambicode', 'tasks', slug);
    if (entry.endsWith('.ambicode') && existsSync(path.join(folder, 'plan.md'))) return folder;
  }
  return null;
}

/** One chain case's files. arm: `plan` (stage 1), `task` (stage 2, needs `seed`) or `bare`; the plugin arm is plan and task. A `real.note` (arm plan) makes the `-chain-plan-inv` case. */
export function caseFiles({ real, sources, arm, seed }) {
  const plugin = arm !== 'bare';
  const name = real.note ? `${planName(real.base)}-inv` : arm === 'plan' ? planName(real.base) : real.name;
  const root = `${String(real.order + 1).padStart(2, '0')}-${name}`;
  const files = new Map();
  const limits = arm === 'plan' ? PLAN_LIMITS : (real.limits ?? TASK_LIMITS);
  files.set(`${root}/case.yaml`, `schema_version: "1.1"\nname: ${name}\ncontext:\n  scaffold_script: scaffold.sh\n`);
  files.set(`${root}/scaffold.sh`, scaffold({ ...sources[real.repo], head: real.parent, policies: true, seeded: arm === 'task' || Boolean(real.note), checksOff: true, remove: real.remove, material: real.material }, plugin));
  if (arm === 'task') for (const [relative, text] of Object.entries(seed)) files.set(`${root}/${relative}`, text);
  if (real.note) for (const [relative, text] of Object.entries(seedFiles(real.slug, real.note.kind, real.note.text))) files.set(`${root}/${relative}`, text);
  files.set(`${root}/prompt.md`, [
    '---',
    `name: ${name}`,
    `description: ${y(`${real.description} ${{ plan: 'Chain stage 1: the plan, accepted.', task: 'Chain stage 2: the task on the plan stage 1 left.', bare: 'Chain bare arm: the raw ticket.' }[arm]}${real.note ? ' Started on an earlier investigation of the code.' : ''}`)}`,
    `tags: ["task", "${CHAIN_TAG}", "${CHAIN_TAG}-${arm}${real.note ? '-inv' : ''}", "${real.kind}"]`,
    'runs: 1',
    `max_turns: ${limits.max_turns}`,
    `timeout_seconds: ${limits.timeout_seconds}`,
    `allowed_tools: [Read, Glob, Grep, Bash, Edit, Write${plugin ? ', Skill, Agent' : ''}]`,
    '---',
    '',
    { plan: planPrompt, task: taskPrompt, bare: barePrompt }[arm](real),
    '',
  ].join('\n'));
  // graderFiles(real, true) points the llm judge at the saved report (the plugin arm's final message is one pointer line) but also adds plan-picked-up and
  // route-done as scoring graders; stage 2 replaces both with the non-scoring routeGraders (route-done passed after any route exit, see TASK_DONE).
  const graders = arm === 'plan' ? planGraders(real) : [...graderFiles(real, plugin).filter((one) => !PLUGIN_ONLY_OLD.has(one.name)), ...(plugin ? routeGraders(real) : [])];
  for (const one of graders) files.set(`${root}/graders/${one.name}.md`, one.text);
  if (arm !== 'plan') {
    const diffGraders = real.graders.filter((g) => g.kind === 'diff').map(({ name, pattern, in: inside, match, weight, perFile }) => ({ name, pattern: DIFF_GRADER_OVERRIDES[real.base]?.[name]?.pattern ?? pattern, ...(DIFF_GRADER_OVERRIDES[real.base]?.[name]?.keptIf === undefined ? {} : { keptIf: DIFF_GRADER_OVERRIDES[real.base][name].keptIf }), ...(DIFF_GRADER_OVERRIDES[real.base]?.[name]?.perFile || perFile ? { perFile: true } : {}), ...(inside === undefined ? {} : { in: inside }), ...(match === undefined ? {} : { match }), weight: weight ?? 1 }));
    files.set(`${root}/truth.json`, `${JSON.stringify({ name: real.name, source: 'changed', level: 'file', relevant: real.relevant, allowed: real.allowed, ...(diffGraders.length === 0 ? {} : { diffGraders }), bench: { repo: real.repo, commit: real.commit, parent: real.parent } }, null, 2)}\n`);
  }
  return files;
}

const chosenOf = (cases) => Object.keys(PLAN_VALUES).map((name, order) => ({ base: cases.find((one) => one.name === name), order })).filter(({ base }) => base).map(({ base, order }) => chainOf(base, order));

function put(evalsDir, tree, files) {
  for (const [relative, text] of files) {
    const file = path.join(evalsDir, tree, CHAIN_TAG, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text, relative.endsWith('.sh') ? { mode: 0o755 } : undefined);
  }
}

/** Removes the case directories of `tree` whose name matches (stage 1 and stage 2 share cases/task-chain; regenerating one must not delete the other). */
function clear(evalsDir, tree, pattern) {
  const root = path.join(evalsDir, tree, CHAIN_TAG);
  for (const entry of existsSync(root) ? readdirSync(root) : []) if (pattern.test(entry)) rmSync(path.join(root, entry), { recursive: true, force: true });
}

/** Rewrites stage 1 (cases tree) and the bare arm; one row per ticket named in PLAN_VALUES that the local file holds. */
export function writeChain({ evalsDir = EVALS, sources, cases = loadRealCases().cases }) {
  clear(evalsDir, 'cases', /-chain-plan(?:-inv)?$/);
  clear(evalsDir, 'bare', /./);
  return chosenOf(cases).flatMap((real) => {
    put(evalsDir, 'cases', caseFiles({ real, sources, arm: 'plan' }));
    put(evalsDir, 'bare', caseFiles({ real, sources, arm: 'bare' }));
    const rows = [{ name: planName(real.base), planGraders: PLAN_VALUES[real.base].length + 1 }];
    if (!real.investigation) return rows;
    // The -inv case: the stage 1 case on a slug of its own (`<slug>ci`) with the investigation note seeded; plugin arm only, like -chain-plan.
    const inv = { ...real, slug: `${real.slug}i`, note: { kind: 'investigation', text: real.investigation } };
    put(evalsDir, 'cases', caseFiles({ real: inv, sources, arm: 'plan' }));
    return [...rows, { name: `${planName(real.base)}-inv`, planGraders: rows[0].planGraders }];
  });
}

/** Rewrites stage 2 (cases tree) from `stamps`, the result stamps of finished stage 1 runs; tickets with no harvested task folder in any stamp are skipped and listed. */
export function writeTask({ evalsDir = EVALS, sources, cases = loadRealCases().cases, stamps, env = process.env }) {
  const chosen = chosenOf(cases);
  const found = chosen.map((real) => {
    const folder = stamps.map((stamp) => harvestedTaskFolder({ stamp, slug: real.slug, evalsDir, env })).find(Boolean) ?? null;
    return { real, seed: folder === null ? null : seedOf(folder, real.slug), folder };
  });
  clear(evalsDir, 'cases', /-chain$/);
  for (const { real, seed } of found) if (seed !== null) put(evalsDir, 'cases', caseFiles({ real, sources, arm: 'task', seed }));
  return found.map(({ real, seed, folder }) => ({ name: real.name, from: folder, files: seed === null ? 0 : Object.keys(seed).length }));
}

function main(argv, env) {
  let evals = EVALS;
  let file;
  const stamps = [];
  for (let at = 0; at < argv.length; at += 1) {
    if (argv[at] === '--evals') evals = path.resolve(argv[++at]);
    else if (argv[at] === '--cases') file = path.resolve(argv[++at]);
    else if (argv[at] === '--from-stamp') stamps.push(argv[++at]);
    else throw new Error(`unknown argument ${argv[at]}`);
  }
  const { repos, cases } = loadRealCases(file);
  const sources = {};
  for (const [key, names] of Object.entries(repos)) {
    if (!env[names.bench]) throw new Error(`env ${names.bench} (the ${key} checkout) is required`);
    const bench = path.resolve(env[names.bench]);
    sources[key] = { bench, context: path.resolve(env[names.context] ?? path.join(bench, '.ambicode', 'context')) };
  }
  if (stamps.length > 0) {
    const rows = writeTask({ evalsDir: evals, sources, cases, stamps, env });
    if (rows.every((row) => row.from === null)) throw new Error(`no stage 2 cases: no stage 1 task folder for any ticket in ${stamps.join(', ')}`);
    for (const row of rows) console.log(row.from === null ? `${row.name}: skipped, no harvested task folder in the given stamps` : `${row.name}: ${row.files} seeded files from ${row.from}`);
    return;
  }
  const rows = writeChain({ evalsDir: evals, sources, cases });
  if (rows.length === 0) throw new Error('no chain cases: the local file holds none of the tickets in PLAN_VALUES');
  for (const row of rows) console.log(`${row.name}: ${row.planGraders} plan graders`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2), process.env); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
