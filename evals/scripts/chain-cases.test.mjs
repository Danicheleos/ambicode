import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { DIFF_GRADER_OVERRIDES, PLAN_VALUES, barePrompt, planGraders, routeGraders, chainName, ci, planPrompt, taskPrompt, chainOf, writeChain, writeTask, seedOf, harvestedTaskFolder, planName, TASK_DONE } from './chain-cases.mjs';
import { archiveOf } from './context.mjs';
import { gradeOne } from './diff-graders.mjs';
import { NO_RUNS, realTruth } from './real-cases.mjs';
import { splitLaunch } from '../../src/hook/events/prompt-launch.ts';

const oneLine = (text) => text.replace(/\s+/g, ' ').trim();

const read = (...parts) => readFileSync(path.join(...parts), 'utf8');
const sources = { r1: { bench: '/bench/r1', context: '/bench/r1/ctx' } };
const GO = 'Go ahead with the plan. Do not run builds, tests, linters or reviews.';
const ACCEPTED_HEAD = '---\nstatus: accepted\n---\n\n';

// A stage 1 run's harvested task folder under a throwaway archive, at the path run.mjs's harvest() gives it (archiveOf of the traces dir).
const PLAN_LEDGER = '{"id":"1","kind":"route","skill":"plan"}\n{"id":"14","route":"1","kind":"gate","details":"/private/tmp/e-x/home/cwd/.ambicode/tasks/SLUG/plan.md"}\n{"id":"19","route":"1","kind":"exit","reason":"done"}\n';
const TASK_TAIL = '{"id":"20","kind":"route","skill":"task"}\n{"id":"47","route":"20","kind":"exit","reason":"done"}\n';
function harvested(root, stamp, slug, { plan = `${ACCEPTED_HEAD}# Plan\n\n## Iteration 1\n- Goal: x.\n`, ledger = PLAN_LEDGER.replaceAll('SLUG', slug), extra = {} } = {}) {
  const env = { AMBICODE_EVAL_ARCHIVE: path.join(root, 'archive') };
  const runs = archiveOf(path.join(root, 'cases', 'results', 'traces', 'plugin', stamp), env);
  const folder = path.join(runs, 'some-case-1.ambicode', '.ambicode', 'tasks', slug);
  mkdirSync(path.join(folder, 'requirements'), { recursive: true });
  writeFileSync(path.join(folder, 'plan.md'), plan);
  writeFileSync(path.join(folder, 'ledger.jsonl'), ledger);
  writeFileSync(path.join(folder, 'requirements', 'jira.md'), 'REQ\n');
  for (const [name, text] of Object.entries(extra)) writeFileSync(path.join(folder, name), text);
  return { env, folder };
}

// Plans written by hand from each ticket's sentences (not from a run or the reference plan): every value the ticket fixes is stated once.
const PLANS = {
  'task-real-k12-celery-email': `${ACCEPTED_HEAD}# Email delivery through Celery on SQS

## Iteration 1
- The five email kinds (registration, forgot password, invitation, single recognition, bulk recognition) each get their own Celery task, so there is one task per kind.
- Payloads are JSON-serializable and validated with typed request models.
- Failed deliveries are logged; they are retried when the SQS visibility timeout expires.
- Delivery happens in a separate worker: the mock client in local and test environments, the real SES client elsewhere.
- The broker URL and the queue URL come from the application settings, with defaults that point at LocalStack.
- In the test environment tasks run eagerly, immediately in the same process, so no broker is needed.

## Iteration 2
- The email repository keeps the same interface (send_registration_email and the rest) and returns right after the job is queued with delay.

## Iteration 3
- A beat schedule fires a placeholder task daily at 14:00 UTC that only logs that the daily report was triggered.
- Add the celery dependency to pyproject.toml; the docker compose file gets a worker and a scheduler container.
`,
  'task-real-k12-recognition-notifications': `${ACCEPTED_HEAD}# Notifications for recognitions

## Iteration 1
- The notification entity has an initiator (nullable, set null on delete of the employee), a receiver, a title, a description, the action text, the action link, a read flag (is_read, default false, so unread at first) and a created timestamp.
- The kind enum has five kinds: new recognition, unresolved issues, new rounding template, overdue template and rounding reminder.
- An Alembic migration creates the table.

## Iteration 2
- One builder per kind lives in its own module, separate from the repository that stores notifications and the code that sends them, so a new kind touches neither.
- The recognition builder links the action to the recognition in the web frontend; it makes one notification per receiver.

## Iteration 3
- Creating a draft does not notify anybody; creation of a non-draft recognition notifies each receiver.
- Publishing drafts notifies only the recognitions that were still drafts before they were saved as published, so an already published recognition is never notified twice.
- Tests cover the direct creation path and the publish drafts path.
`,
};
// A plan with the shape of a real one and none of the ticket's values.
const GENERIC = `${ACCEPTED_HEAD}# Plan\n\n## Iteration 1\n- Goal: change the service as asked in src/a.py:10.\n- Accept: the behaviour works.\n`;

const grade = (g, text) => new RegExp(g.pattern).test(text);

describe('chain cases: plan-side graders', () => {
  for (const [ticket, values] of Object.entries(PLAN_VALUES)) {
    it(`${ticket}: a hand-written plan stating every ticket value passes each grader; an empty file, a draft and a value-free plan fail them`, () => {
      for (const g of values) {
        assert.ok(grade(g, PLANS[ticket]), `${g.name} should match the hand-written plan`);
        assert.ok(!grade(g, ''), `${g.name} should fail on an empty plan`);
        assert.ok(!grade(g, GENERIC), `${g.name} should fail on a plan with none of the ticket's values`);
      }
    });
  }

  it('plan-accepted wants `status: accepted` in the frontmatter, not a draft and not the word in the body', () => {
    const real = ({ name: 'task-real-k12-celery-email', slug: 'rl-x', repo: 'r1', graders: [], relevant: [], allowed: [], limits: { max_turns: 10, timeout_seconds: 10 }, kind: 'infra', description: 'd', prompt: 'p', parent: 'a'.repeat(40), commit: 'b'.repeat(40) });
    const root = mkdtempSync(path.join(tmpdir(), 'chain-cases-'));
    writeChain({ evalsDir: root, sources, cases: [real] });
    const text = read(root, 'cases', 'task-chain', '01-task-real-k12-celery-email-chain-plan', 'graders', 'plan-accepted.md');
    const pattern = new RegExp(/^pattern: '(.*)'$/m.exec(text)[1].replace(/''/g, "'"));
    assert.ok(pattern.test('---\nstatus: accepted\n---\n\n# Plan'));
    assert.ok(pattern.test('---\nname: x\nstatus: accepted\n---\n'));
    assert.ok(!pattern.test('---\nstatus: draft\n---\n\nThis plan is accepted.'));
    assert.ok(!pattern.test(''));
  });

  // Reproduction: the harness closed the frontmatter at a `---` inside the plan-accepted pattern value ("YAML Parse error: Unexpected EOF").
  // An unanchored splitter and a line-anchored one must agree on every grader file, and the text must parse with a `type`.
  it('every generated grader file has frontmatter that an unanchored splitter reads the same as a line-anchored one, and it parses with a type', () => {
    const cases = Object.keys(PLAN_VALUES).map((name, i) => ({ name, slug: `rl-${i}`, repo: 'r1', graders: [{ kind: 'file', name: 'f', file: 'src/a.py', pattern: 'x' }, { kind: 'llm', name: 'design', rubric: 'PASS if ok.' }], relevant: [], allowed: [], limits: { max_turns: 10, timeout_seconds: 10 }, kind: 'infra', description: 'd', prompt: 'p', parent: 'a'.repeat(40), commit: 'b'.repeat(40) }));
    const root = mkdtempSync(path.join(tmpdir(), 'chain-fm-'));
    writeChain({ evalsDir: root, sources, cases });
    const { env } = harvested(root, 'S', 'rl-0c');
    writeTask({ evalsDir: root, sources, cases, stamps: ['S'], env });
    let checked = 0;
    for (const arm of ['cases', 'bare']) {
      for (const dirName of readdirSync(path.join(root, arm, 'task-chain'))) {
        for (const file of readdirSync(path.join(root, arm, 'task-chain', dirName, 'graders'))) {
          const text = read(root, arm, 'task-chain', dirName, 'graders', file);
          const loose = /^---\s*\n([\s\S]*?)---\s*\n?/.exec(text)[1];
          const lines = text.split('\n');
          const close = lines.indexOf('---', 1);
          const anchored = `${lines.slice(1, close).join('\n')}\n`;
          assert.equal(lines[0], '---');
          assert.equal(loose, anchored, `${dirName}/${file}: the frontmatter ends at a different place for an unanchored splitter`);
          assert.ok(parseYaml(loose).type, `${dirName}/${file}: no type`);
          checked += 1;
        }
      }
    }
    assert.ok(checked >= 2 * (Object.keys(PLAN_VALUES).length) + 2 * 2, `only ${checked} grader files checked`);
    assert.ok(readdirSync(path.join(root, 'cases', 'task-chain')).some((d) => d.endsWith('-chain')), 'the stage 2 case was checked too');
  });

  it('ci makes letters case-insensitive and leaves escapes alone', () => {
    assert.equal(ci('a\\sb'), '[aA]\\s[bB]');
    assert.ok(new RegExp(ci('daily[ _-]report')).test('Daily_Report'));
  });
});

describe('chain cases: the generator', () => {
  const FIXTURE = [
    { name: 'task-real-k12-celery-email', repo: 'r1', kind: 'infra', slug: 'rl-k12-ce', commit: 'a'.repeat(40), parent: 'b'.repeat(40), description: 'Celery.', prompt: 'Move sending\nto Celery on an SQS queue.', relevant: ['src/a.py'], allowed: ['tests/'], limits: { max_turns: 100, timeout_seconds: 2400 },
      graders: [{ kind: 'file', name: 'broker-in-settings', file: 'src/config.py', pattern: 'SQS', weight: 2 }, { kind: 'diff', name: 'celery-app', pattern: 'Celery\\(', in: '^src/' }, { kind: 'llm', name: 'design', rubric: 'PASS if ok.' }] },
    { name: 'task-real-k12-recognition-notifications', repo: 'r1', kind: 'hard', slug: 'rl-k12-rn', commit: 'c'.repeat(40), parent: 'd'.repeat(40), description: 'Notifications.', prompt: 'Add notifications.', relevant: [], allowed: [], graders: [{ kind: 'file', name: 'x', file: 'src/x.py', pattern: 'y' }] },
    { name: 'task-real-other', repo: 'r1', kind: 'x', slug: 'rl-o', commit: 'e'.repeat(40), parent: 'f'.repeat(40), description: 'Other.', prompt: 'Other.', relevant: [], allowed: [], graders: [] },
  ];
  const root = mkdtempSync(path.join(tmpdir(), 'chain-gen-'));
  const rows = writeChain({ evalsDir: root, sources, cases: FIXTURE });
  const { env } = harvested(root, 'STAMP-A', 'rl-k12-cec', { extra: { 'report.md': 'task report\n', 'summary.md': 'x\n', 'result_2026-11-02T20-37.md': 'Done.\n', 'changed_2026-11-02T20-38.md': 'Changed: x\n' } });
  harvested(root, 'STAMP-B', 'rl-k12-rnc', { ledger: PLAN_LEDGER.replaceAll('SLUG', 'rl-k12-rnc') + TASK_TAIL });
  const taskRows = writeTask({ evalsDir: root, sources, cases: FIXTURE, stamps: ['STAMP-A', 'STAMP-B'], env });
  const dir = (arm, n) => path.join(root, arm, 'task-chain', n);
  const celeryPlan = '01-task-real-k12-celery-email-chain-plan';
  const celery = '01-task-real-k12-celery-email-chain';
  const recog = '02-task-real-k12-recognition-notifications-chain';
  const recogPlan = '02-task-real-k12-recognition-notifications-chain-plan';

  it('renders stage 1 (-chain-plan) and stage 2 (-chain) per ticket named in PLAN_VALUES plus the bare -chain case, and nothing else', () => {
    assert.deepEqual(rows.map((r) => r.name), ['task-real-k12-celery-email-chain-plan', 'task-real-k12-recognition-notifications-chain-plan']);
    assert.deepEqual(taskRows.map((r) => r.name), ['task-real-k12-celery-email-chain', 'task-real-k12-recognition-notifications-chain']);
    assert.deepEqual(readdirSync(path.join(root, 'cases', 'task-chain')).sort(), [celery, celeryPlan, recog, recogPlan]);
    assert.deepEqual(readdirSync(path.join(root, 'bare', 'task-chain')).sort(), [celery, recog]);
    assert.equal(chainName('task-real-a'), 'task-real-a-chain');
    assert.equal(planName('task-real-a'), 'task-real-a-chain-plan');
    assert.equal(realTruth('task-real-k12-celery-email-chain', root).bench.parent, 'b'.repeat(40));
    assert.equal(realTruth('task-real-k12-celery-email-chain-plan', root), null, 'stage 1 has no code truth');
  });

  it('the stage 1 prompt is the typed plan command with the ticket and nothing else (no task instruction), and the hook parser reads it as the three options plus the ticket', () => {
    const body = read(dir('cases', celeryPlan), 'prompt.md').replace(/^---[\s\S]*?---\n\n/, '').trim();
    assert.equal(body, planPrompt(chainOf(FIXTURE[0], 0)));
    assert.equal(body, '/ambicode:plan --task rl-k12-cec --headless --answer plan-accept=Accept Move sending to Celery on an SQS queue.');
    assert.doesNotMatch(body, /ambicode:task|Go ahead|--no-review|ambicode:review/);
    for (const real of FIXTURE.slice(0, 2)) {
      const chain = chainOf(real, 0);
      const match = /^\/ambicode:(\w+)\b([\s\S]*)$/.exec(planPrompt(chain).trim());
      assert.equal(match[1], 'plan');
      const launch = splitLaunch(match[2].trim());
      assert.deepEqual(launch.args, ['--task', chain.slug, '--headless', '--answer', 'plan-accept=Accept']);
      assert.equal(launch.text, oneLine(real.prompt), 'the request is the ticket alone');
    }
  });

  it('the stage 2 prompt is the typed task command on the same slug with the task-real request wording, and the hook parser keeps the request whole', () => {
    const body = read(dir('cases', celery), 'prompt.md').replace(/^---[\s\S]*?---\n\n/, '').trim();
    assert.equal(body, taskPrompt(chainOf(FIXTURE[0], 0)));
    assert.equal(body, `/ambicode:task --task rl-k12-cec --headless "${GO}"`);
    const launch = splitLaunch(/^\/ambicode:task\b([\s\S]*)$/.exec(body)[1].trim());
    assert.deepEqual(launch.args, ['--task', 'rl-k12-cec', '--headless']);
    assert.equal(launch.text, `"${GO}"`);
  });

  it('the stage 2 case is seeded from the harvested folder: plan.md with status accepted, the ledger cut at the plan exit, the other notes; scaffold.sh copies seed/ into .ambicode', () => {
    const seed = (n, ...parts) => read(dir('cases', n), 'seed', 'tasks', ...parts);
    assert.match(seed(celery, 'rl-k12-cec', 'plan.md'), /^---\nstatus: accepted\n---\n/);
    assert.equal(seed(celery, 'rl-k12-cec', 'ledger.jsonl'), PLAN_LEDGER.replaceAll('SLUG', 'rl-k12-cec'));
    assert.equal(seed(celery, 'rl-k12-cec', 'requirements', 'jira.md'), 'REQ\n');
    assert.ok(!existsSync(path.join(dir('cases', celery), 'seed', 'tasks', 'rl-k12-cec', 'report.md')), 'task-route products are not seeded');
    assert.ok(!existsSync(path.join(dir('cases', celery), 'seed', 'tasks', 'rl-k12-cec', 'summary.md')));
    // The Stop hook saves a stage 1 run's final message as result_<stamp>.md (src/harness/engine/stop.ts); stage 2 reads plan.md, the ledger and requirements, never it.
    assert.deepEqual(readdirSync(path.join(dir('cases', celery), 'seed', 'tasks', 'rl-k12-cec')).sort(), ['ledger.jsonl', 'plan.md', 'requirements']);
    // The second ledger carried the task route of a one-prompt run; the seed stops at the plan exit.
    assert.equal(seed(recog, 'rl-k12-rnc', 'ledger.jsonl'), PLAN_LEDGER.replaceAll('SLUG', 'rl-k12-rnc'));
    assert.match(read(dir('cases', celery), 'scaffold.sh'), /cp -R "\$\(dirname "\$0"\)\/seed\/\." \.ambicode\//);
    assert.ok(!read(dir('cases', celeryPlan), 'scaffold.sh').includes('/seed/'), 'stage 1 is not seeded');
    assert.ok(!existsSync(path.join(dir('cases', celeryPlan), 'seed')));
    assert.ok(!existsSync(path.join(dir('bare', celery), 'seed')));
    assert.ok(!read(dir('bare', celery), 'scaffold.sh').includes('.ambicode'));
  });

  it('a stage 1 run that did not finish (draft plan, no plan.md, no exit in the ledger) is refused, not seeded', () => {
    const r2 = mkdtempSync(path.join(tmpdir(), 'chain-bad-'));
    const draft = harvested(r2, 'D', 'rl-k12-cec', { plan: '---\nstatus: draft\n---\n\n# Plan\n' });
    assert.throws(() => seedOf(draft.folder, 'rl-k12-cec'), /no accepted plan\.md/);
    const open = harvested(r2, 'E', 'rl-k12-cec', { ledger: '{"id":"1","kind":"route","skill":"plan"}\n' });
    assert.throws(() => seedOf(open.folder, 'rl-k12-cec'), /no route exit/);
    assert.equal(harvestedTaskFolder({ stamp: 'MISSING', slug: 'rl-k12-cec', evalsDir: r2, env: open.env }), null);
    assert.throws(() => seedOf(path.join(r2, 'nothing'), 'x'), /no accepted plan\.md/);
  });

  it('regenerating stage 1 leaves stage 2 in place and regenerating stage 2 leaves stage 1 in place', () => {
    writeChain({ evalsDir: root, sources, cases: FIXTURE });
    assert.ok(existsSync(dir('cases', celery)));
    writeTask({ evalsDir: root, sources, cases: FIXTURE, stamps: ['STAMP-A', 'STAMP-B'], env });
    assert.ok(existsSync(dir('cases', celeryPlan)));
  });

  it('the bare prompt is the raw ticket once plus the no-runs line, names nothing of AMBICODE, and has no plan-side grader, task-done or Skill tool', () => {
    const body = read(dir('bare', celery), 'prompt.md').replace(/^---[\s\S]*?---\n\n/, '').trim();
    assert.equal(body, barePrompt(FIXTURE[0]));
    assert.equal(body.split('Celery on an SQS queue').length, 2);
    assert.doesNotMatch(body, /ambicode|plan-accept/i);
    const graders = readdirSync(path.join(dir('bare', celery), 'graders'));
    assert.deepEqual(graders.sort(), ['broker-in-settings.md', 'design.md']);
    assert.doesNotMatch(read(dir('bare', celery), 'prompt.md'), /Skill/);
  });

  it('stage 1 carries exactly the plan graders; stage 2 the task graders on the chain slug plus the route graders; limits are the old plan limits for stage 1 and the task limits for stage 2', () => {
    const planNames = readdirSync(path.join(dir('cases', celeryPlan), 'graders')).sort();
    assert.deepEqual(planNames, ['plan-accepted.md', ...PLAN_VALUES['task-real-k12-celery-email'].map((v) => `${v.name}.md`)].sort());
    assert.match(read(dir('cases', celeryPlan), 'graders', 'plan-accepted.md'), /path: \.ambicode\/tasks\/rl-k12-cec\/plan\.md/);
    assert.deepEqual(readdirSync(path.join(dir('cases', celery), 'graders')).sort(), ['broker-in-settings.md', 'design.md', 'plan-picked-up.md', 'task-done.md']);
    assert.match(read(dir('cases', celery), 'graders', 'plan-picked-up.md'), /tasks\/rl-k12-cec\/plan/);
    assert.match(read(dir('cases', celery), 'graders', 'design.md'), /tasks\/rl-k12-cec\/report\.md/);
    assert.match(read(dir('cases', celeryPlan), 'prompt.md'), /max_turns: 30\ntimeout_seconds: 900\n/);
    assert.match(read(dir('cases', celery), 'prompt.md'), /max_turns: 100\ntimeout_seconds: 2400\n/);
    assert.match(read(dir('bare', celery), 'prompt.md'), /max_turns: 100\ntimeout_seconds: 2400\n/);
    assert.match(read(dir('cases', recogPlan), 'prompt.md'), /max_turns: 30\ntimeout_seconds: 900\n/);
    assert.match(read(dir('cases', recog), 'prompt.md'), /max_turns: 60\ntimeout_seconds: 1500\n/);
    assert.ok(JSON.parse(read(dir('bare', celery), 'truth.json')).diffGraders.some((g) => g.name === 'celery-app'));
    assert.ok(JSON.parse(read(dir('cases', celery), 'truth.json')).diffGraders.some((g) => g.name === 'celery-app'));
    assert.ok(read(dir('cases', celery), 'scaffold.sh').includes(`archive --format=tar ${'b'.repeat(40)}`));
  });

  it('the scaffold of stage 2 puts the seed into .ambicode: run in a sandbox (bench stubbed), plan.md and the ledger land under .ambicode/tasks/<slug>', () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), 'chain-sb-'));
    const bench = mkdtempSync(path.join(tmpdir(), 'chain-bench-'));
    mkdirSync(path.join(bench, '.ambicode'), { recursive: true });
    writeFileSync(path.join(bench, '.ambicode', 'config.yaml'), 'a: 1\n');
    execFileSync('git', ['init', '-q'], { cwd: bench });
    writeFileSync(path.join(bench, 'f.txt'), 'x');
    execFileSync('git', ['add', '-A'], { cwd: bench });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@x', 'commit', '-q', '-m', 'm'], { cwd: bench });
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: bench, encoding: 'utf8' }).trim();
    const r3 = mkdtempSync(path.join(tmpdir(), 'chain-sc-'));
    const real = { ...FIXTURE[0], parent: head };
    const { env: e3 } = harvested(r3, 'S', 'rl-k12-cec');
    writeTask({ evalsDir: r3, sources: { r1: { bench, context: path.join(bench, 'no-context') } }, cases: [real], stamps: ['S'], env: e3 });
    // checksOff runs a node script on config.yaml and the context index runs only when a context exists; neither matters here.
    execFileSync('sh', [path.join(r3, 'cases', 'task-chain', celery, 'scaffold.sh')], { cwd: sandbox, encoding: 'utf8' });
    assert.match(read(sandbox, '.ambicode', 'tasks', 'rl-k12-cec', 'plan.md'), /^---\nstatus: accepted\n---\n/);
    assert.equal(read(sandbox, '.ambicode', 'tasks', 'rl-k12-cec', 'ledger.jsonl'), PLAN_LEDGER.replaceAll('SLUG', 'rl-k12-cec'));
  });
});

// Near-miss plans: per grader, a paraphrase that must pass, and plans that state the words but not the ticket's meaning (scattered over
// unrelated lines, or only as substrings: `uses` for ses, `catalog` for log, `tissues` for issues, `webhook` for web) that must fail.
const FILLER = Array.from({ length: 12 }, (_, i) => `- Unrelated step ${i}: keep the module layout tidy and the naming consistent.`).join('\n');
const NEAR = {
  'plan-worker-delivers-mock-local-test-ses-elsewhere': {
    pass: ['- A separate worker delivers the mail. Mock client for local and test, the real SES client in other environments.', `- A worker delivers the mail.\n- Mock the clock.\n${FILLER}\n- The local setup is documented.\n- Tests run in CI.\n- SES is the production sender.`, '- Delivery runs in a worker; locally and in tests it uses a mocked client, in production the SES one.'],
    fail: ['- A separate worker delivers the mail; it uses the mock client in local and test, and the real client elsewhere.', '- A worker delivers the mail. Mock the clock; the local setup uses the cache.'],
  },
  'plan-five-kinds': {
    pass: ['- Kinds: a new recognition, unresolved issues, a new rounding template, an overdue template and a rounding reminder.', `- A new recognition.\n${FILLER}\n- Unresolved issues.\n${FILLER}\n- A template, overdue, a reminder.`, '- The kind enum:\n  - recognition\n  - unresolved issue\n  - template\n  - overdue\n  - reminder'],
    fail: ['- Kinds: recognition, tissues, templates, overdue, reminder.', `- A new recognition.\n${FILLER}\n- A template, overdue, a reminder.`],
  },
  'plan-daily-1400-utc-only-logs': {
    pass: ['- A beat entry fires a daily task at 14:00 UTC that only logs that it was triggered.', '- Every day at 14:00 UTC the scheduler runs a placeholder:\n  it logs the trigger and does nothing else.'],
    fail: [`- Schedule daily at 14:00 UTC.\n${FILLER}\n- Log lines get a request id.`, '- A daily job at 14:00 UTC that refreshes the catalog.', `- The cache logs hits.\n${FILLER}\n- Daily jobs are listed.\n${FILLER}\n- Times are UTC, for example 14:00.`],
  },
  'plan-eager-in-test-environment': {
    pass: ['- In the test environment tasks run eagerly in the same process, so no broker is needed.', '- Test settings execute tasks immediately, without a broker.'],
    fail: ['- In tests tasks run eagerly in the same process.', '- Tasks run eagerly in production workers.\n- Test data is seeded.\n- A broker is required.', '- Tasks run immediately in the latest release, no broker.'],
  },
  'plan-broker-queue-from-settings-localstack-defaults': {
    pass: ['- The broker URL and the queue URL come from the application settings, with defaults that point at LocalStack.', '- Settings:\n  - CELERY_BROKER_URL\n  - CELERY_QUEUE_URL\n- Defaults point at LocalStack.', '- Settings hold the broker and queue addresses, defaulting to LocalStack.'],
    fail: ['- The settings module is refactored.\n- The broker is Redis.\n- The queue names are listed.\n- A default is chosen.', '- Broker and queue come from settings; a defaultdict caches localstack lookups.'],
  },
  'plan-action-links-to-recognition-in-frontend': {
    pass: ['- The action link points to the recognition page in the web frontend.', '- Action URL: the recognition in the front-end.'],
    fail: ['- Links are validated.\n- Recognition rows are stored.\n- The frontend is not touched.', '- A webhook link to the recognition.'],
  },
  'plan-interface-kept-returns-after-queueing': {
    pass: ['- The existing email interface stays unchanged; callers return as soon as the task is queued.', '- Signatures remain unchanged and the calls return after queueing.', '- Keep send_registration_email as it is; it enqueues the job and returns.'],
    fail: ['- The interface is replaced by a new async API; jobs are queued.', '- The interface is documented.\n- Keep the logs tidy.\n- Jobs go to the queue.'],
  },
  'plan-tests-cover-both-paths': {
    pass: ['- Tests cover direct creation and publishing drafts.', '- Publishing drafts is covered by tests.\n- Direct creation is covered by tests as well.'],
    fail: ['- Tests cover the publish drafts path.', '- The latest draft is published directly.', `- Tests run in CI.\n\n${FILLER}\n\n- Drafts exist, direct creation of rows.`],
  },
  'plan-fields-listed': {
    pass: ['- Fields: actor (nullable), recipient, subject, body, action_label, action_url, is_read, created_at.'],
    fail: ['- Fields: initiator, receiver, title, description, action text, read flag, created.', '- Fields: initiator, receivers, subtitle, descriptions, action text, action link, readme, created.'],
  },
};

describe('chain cases: plan graders on near-miss plans', () => {
  const byName = Object.fromEntries(Object.values(PLAN_VALUES).flat().map((g) => [g.name, g]));
  for (const [name, { pass, fail }] of Object.entries(NEAR)) {
    it(`${name}: paraphrases pass; scattered words and substring traps fail`, () => {
      const g = byName[name];
      assert.ok(g, `${name} exists`);
      pass.forEach((plan, i) => assert.ok(grade(g, plan), `pass ${i} should match`));
      fail.forEach((plan, i) => assert.ok(!grade(g, plan), `fail ${i} should not match`));
    });
  }
});

describe('chain cases: scoring', () => {
  const real = { name: 'task-real-k12-celery-email', slug: 'rl-x', repo: 'r1', graders: [{ kind: 'file', name: 'a', file: 'src/a.py', pattern: 'x', weight: 2 }, { kind: 'llm', name: 'design', rubric: 'PASS if ok.' }, { kind: 'diff', name: 'd', pattern: 'y' }], relevant: [], allowed: [], limits: { max_turns: 10, timeout_seconds: 10 }, kind: 'infra', description: 'd', prompt: 'p', parent: 'a'.repeat(40), commit: 'b'.repeat(40) };
  const root = mkdtempSync(path.join(tmpdir(), 'chain-score-'));
  writeChain({ evalsDir: root, sources, cases: [real] });
  writeTask({ evalsDir: root, sources, cases: [real], stamps: ['S'], env: harvested(root, 'S', 'rl-xc').env });
  const dir = (arm) => path.join(root, arm, 'task-chain', '01-task-real-k12-celery-email-chain', 'graders');
  const planDir = path.join(root, 'cases', 'task-chain', '01-task-real-k12-celery-email-chain-plan', 'graders');
  const front = (arm, file) => read(dir(arm), file);
  const scoring = (arm) => readdirSync(dir(arm)).filter((file) => !/^arm: with-only$/m.test(front(arm, file))).map((file) => `${file}:${/^weight: (\d+)$/m.exec(front(arm, file))[1]}`).sort();

  it('the scoring graders of the plugin arm are exactly the bare arm\'s: same names, same weights', () => {
    assert.deepEqual(scoring('cases'), scoring('bare'));
    assert.deepEqual(scoring('bare'), ['a.md:2', 'design.md:1']);
  });

  it('every plugin-only grader (stage 1: plan-accepted and the value graders; stage 2: plan-picked-up, task-done) is marked arm: with-only and never exists in the bare arm', () => {
    const marked = (d) => readdirSync(d).filter((file) => /^arm: with-only$/m.test(read(d, file))).map((file) => file.replace(/\.md$/, '')).sort();
    assert.deepEqual(marked(dir('cases')), ['plan-picked-up', 'task-done']);
    assert.deepEqual(marked(planDir), readdirSync(planDir).map((file) => file.replace(/\.md$/, '')).sort(), 'every stage 1 grader is plugin-only');
    const expected = ['plan-accepted', 'plan-picked-up', 'task-done', ...PLAN_VALUES[real.name].map((g) => g.name)].sort();
    assert.deepEqual([...marked(dir('cases')), ...marked(planDir)].sort(), expected);
    for (const name of expected) assert.ok(!existsSync(path.join(dir('bare'), `${name}.md`)), name);
    assert.ok(!existsSync(path.join(dir('cases'), 'route-done.md')), 'the any-exit route-done is gone');
    for (const g of [...planGraders(chainOf(real, 0)), ...routeGraders(chainOf(real, 0))]) assert.match(g.text, /^---\narm: with-only\n/);
  });

  it('task-done, over real ledger lines (fixtures/ copied from the archived runs: route-start and exit lines only), passes only when the task route itself exited done', () => {
    const task = routeGraders(chainOf(real, 0)).find((g) => g.name === 'task-done');
    const pattern = new RegExp(/^pattern: '(.*)'$/m.exec(task.text)[1].replace(/\'\'/g, "'"));
    assert.equal(pattern.source, new RegExp(TASK_DONE).source);
    const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
    assert.ok(pattern.test(fixture('ledger-task-done.jsonl')), 'celery stage-2 run: plan exit then task exit done');
    assert.ok(!pattern.test(fixture('ledger-stage2-seed.jsonl')), 'seed ledger already holds the plan exit done');
    assert.ok(!pattern.test(fixture('ledger-plan-only.jsonl')), 'plan-only recognition ledger');
    const lines = fixture('ledger-task-done.jsonl').trim().split('\n');
    assert.ok(!pattern.test(lines.slice(0, 3).join('\n') + '\n' + lines[3].replace('"reason":"done"', '"reason":"abandoned"')), 'task exit not done');
  });
});

describe('chain cases: harness limits', () => {
  it('no generated case asks for more than the harness cap of 3600 seconds, in either arm, whatever its own limits', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'chain-cap-'));
    const heavy = { name: 'task-real-k12-celery-email', slug: 'rl-h', repo: 'r1', graders: [{ kind: 'llm', name: 'design', rubric: 'PASS if ok.' }], relevant: [], allowed: [], limits: { max_turns: 60, timeout_seconds: 2760 }, kind: 'infra', description: 'd', prompt: 'p', parent: 'a'.repeat(40), commit: 'b'.repeat(40) };
    writeChain({ evalsDir: root, sources, cases: [heavy] });
    writeTask({ evalsDir: root, sources, cases: [heavy], stamps: ['S'], env: harvested(root, 'S', 'rl-hc').env });
    for (const arm of ['cases', 'bare']) {
      const suite = path.join(root, arm, 'task-chain');
      for (const entry of readdirSync(suite)) assert.ok(Number(/^timeout_seconds: (\d+)$/m.exec(read(suite, entry, 'prompt.md'))[1]) <= 3600, `${arm}/${entry}`);
    }
  });
});

// Regression for the seven graders that missed values a plan holds (regrade of the archived chain plans, evals/cases/results traces 2026-10-31T11-46-59 and 11-49-09):
// the patterns as they were, and per grader a plan that states the value as an identifier (snake_case, UPPER_CASE) or over separate lines.
const OLD_SEVEN = {
  "plan-interface-kept-returns-after-queueing": "^(?=[\\s\\S]*?(?:(?:\\b(?:[iI][nN][tT][eE][rR][fF][aA][cC][eE][sS]?|[sS][iI][gG][nN][aA][tT][uU][rR][eE][sS]?|[mM][eE][tT][hH][oO][dD][sS]?|[aA][pP][iI])\\b|[sS][eE][nN][dD]_\\w+)[^\\n]{0,80}(?:\\b(?:[sS][aA][mM][eE]|[uU][nN][cC][hH][aA][nN][gG][eE][dD]|[kK][eE][pP][tT]?|[kK][eE][eE][pP][sS]?|[sS][tT][aA][yY][sS]?|[rR][eE][mM][aA][iI][nN][sS]?|[rR][eE][tT][aA][iI][nN][sS]?|[pP][rR][eE][sS][eE][rR][vV]\\w+|[eE][xX][iI][sS][tT][iI][nN][gG])\\b|[nN][oO][tT] [cC][hH][aA][nN][gG]\\w+)|(?:\\b(?:[sS][aA][mM][eE]|[uU][nN][cC][hH][aA][nN][gG][eE][dD]|[kK][eE][pP][tT]?|[kK][eE][eE][pP][sS]?|[sS][tT][aA][yY][sS]?|[rR][eE][mM][aA][iI][nN][sS]?|[rR][eE][tT][aA][iI][nN][sS]?|[pP][rR][eE][sS][eE][rR][vV]\\w+|[eE][xX][iI][sS][tT][iI][nN][gG])\\b|[nN][oO][tT] [cC][hH][aA][nN][gG]\\w+)[^\\n]{0,80}(?:\\b(?:[iI][nN][tT][eE][rR][fF][aA][cC][eE][sS]?|[sS][iI][gG][nN][aA][tT][uU][rR][eE][sS]?|[mM][eE][tT][hH][oO][dD][sS]?|[aA][pP][iI])\\b|[sS][eE][nN][dD]_\\w+)))(?=[\\s\\S]*?(?:\\b(?:[qQ][uU][eE][uU][eE](?:[dD]|[sS])?|[qQ][uU][eE][uU][iI][nN][gG]|[qQ][uU][eE][uU][eE][iI][nN][gG]|[eE][nN][qQ][uU][eE][uU][eE](?:[dD]|[sS])?|[dD][eE][lL][aA][yY]|[aA][pP][pP][lL][yY]_[aA][sS][yY][nN][cC])\\b))",
  "plan-worker-delivers-mock-local-test-ses-elsewhere": "^(?=[\\s\\S]*?(?:\\b[wW][oO][rR][kK][eE][rR][sS]?\\b))(?=[\\s\\S]*?(?:(?:(?=[^\\n]{0,300}?(?:\\b[mM][oO][cC][kK]\\w*))(?=[^\\n]{0,300}?(?:\\b[lL][oO][cC][aA][lL](?:[lL][yY])?\\b))(?=[^\\n]{0,300}?(?:\\b[tT][eE][sS][tT](?:[sS]|[iI][nN][gG])?\\b))(?=[^\\n]{0,300}?(?:\\b[sS][eE][sS]\\b)))))",
  "plan-eager-in-test-environment": "^(?=[\\s\\S]*?(?:(?:(?=[^\\n]{0,300}?(?:\\b[eE][aA][gG][eE][rR](?:[lL][yY])?\\b|\\b[iI][mM][mM][eE][dD][iI][aA][tT][eE][lL][yY]\\b|\\b[sS][aA][mM][eE] [pP][rR][oO][cC][eE][sS][sS]\\b))(?=[^\\n]{0,300}?(?:\\b[tT][eE][sS][tT](?:[sS]|[iI][nN][gG])?\\b)))))(?=[\\s\\S]*?(?:(?:(?=[\\s\\S]{0,250}?(?:\\b[eE][aA][gG][eE][rR](?:[lL][yY])?\\b|\\b[iI][mM][mM][eE][dD][iI][aA][tT][eE][lL][yY]\\b|\\b[sS][aA][mM][eE] [pP][rR][oO][cC][eE][sS][sS]\\b))(?=[\\s\\S]{0,250}?(?:(?:\\b[wW][iI][tT][hH][oO][uU][tT]|\\b[nN][oO]|\\b[nN][oO][tT] (?:[nN][eE][eE][dD]|[rR][eE][qQ][uU][iI][rR][eE])\\w*)[^\\n]{0,30}\\b[bB][rR][oO][kK][eE][rR]\\b|\\b[bB][rR][oO][kK][eE][rR]\\b[^\\n]{0,30}(?:[nN][oO][tT] (?:[nN][eE][eE][dD][eE][dD]|[rR][eE][qQ][uU][iI][rR][eE][dD])|[uU][nN][nN][eE][eE][dD][eE][dD]))))))",
  "plan-broker-queue-from-settings-localstack-defaults": "^(?=[\\s\\S]*?(?:(?:(?=[^\\n]{0,300}?(?:\\b[sS][eE][tT][tT][iI][nN][gG][sS]?\\b|\\b[cC][oO][nN][fF][iI][gG](?:[uU][rR][aA][tT][iI][oO][nN])?\\b))(?=[^\\n]{0,300}?(?:\\b[bB][rR][oO][kK][eE][rR]\\b))(?=[^\\n]{0,300}?(?:\\b[qQ][uU][eE][uU][eE]\\b)))))(?=[\\s\\S]*?(?:(?:(?=[^\\n]{0,200}?(?:\\b[lL][oO][cC][aA][lL][sS][tT][aA][cC][kK]\\b))(?=[^\\n]{0,200}?(?:\\b[dD][eE][fF][aA][uU][lL][tT](?:[sS]|[iI][nN][gG]|[eE][dD])?\\b)))))",
  "plan-initiator-may-be-empty": "(?:[iI][nN][iI][tT][iI][aA][tT][oO][rR]|[tT][rR][iI][gG][gG][eE][rR][eE][dD] [bB][yY])[^\\n]{0,160}(?:[nN][uU][lL][lL][aA][bB][lL][eE]|[eE][mM][pP][tT][yY]|[sS][eE][tT] [nN][uU][lL][lL]|[oO][nN] [dD][eE][lL][eE][tT][eE]|[oO][pP][tT][iI][oO][nN][aA][lL]|[nN][oO][nN][eE])|(?:[nN][uU][lL][lL][aA][bB][lL][eE]|[eE][mM][pP][tT][yY]|[sS][eE][tT] [nN][uU][lL][lL]|[oO][nN] [dD][eE][lL][eE][tT][eE]|[oO][pP][tT][iI][oO][nN][aA][lL]|[nN][oO][nN][eE])[^\\n]{0,160}(?:[iI][nN][iI][tT][iI][aA][tT][oO][rR]|[tT][rR][iI][gG][gG][eE][rR][eE][dD] [bB][yY])",
  "plan-five-kinds": "^(?=[\\s\\S]*?(?:(?:(?=[\\s\\S]{0,500}?(?:\\b[nN][eE][wW] [rR][eE][cC][oO][gG][nN][iI][tT][iI][oO][nN][sS]?\\b|\\b[rR][eE][cC][oO][gG][nN][iI][tT][iI][oO][nN][sS]?\\b))(?=[\\s\\S]{0,500}?(?:\\b[uU][nN][rR][eE][sS][oO][lL][vV][eE][dD]\\b|\\b[iI][sS][sS][uU][eE][sS]?\\b))(?=[\\s\\S]{0,500}?(?:\\b[tT][eE][mM][pP][lL][aA][tT][eE][sS]?\\b))(?=[\\s\\S]{0,500}?(?:\\b[oO][vV][eE][rR][dD][uU][eE]\\b))(?=[\\s\\S]{0,500}?(?:\\b[rR][eE][mM][iI][nN][dD](?:[eE][rR]|[eE][rR][sS])?\\b)))))",
  "plan-tests-cover-both-paths": "^(?=[\\s\\S]*?(?:(?:\\b[tT][eE][sS][tT][sS]?\\b|\\b[cC][oO][vV][eE][rR](?:[sS]|[eE][dD]|[aA][gG][eE])?\\b)[^\\n]{0,200}(?:[dD][rR][aA][fF][tT]|[pP][uU][bB][lL][iI][sS][hH])|(?:[dD][rR][aA][fF][tT]|[pP][uU][bB][lL][iI][sS][hH])[^\\n]{0,200}(?:\\b[tT][eE][sS][tT][sS]?\\b|\\b[cC][oO][vV][eE][rR](?:[sS]|[eE][dD]|[aA][gG][eE])?\\b)))(?=[\\s\\S]*?(?:(?:\\b[tT][eE][sS][tT][sS]?\\b|\\b[cC][oO][vV][eE][rR](?:[sS]|[eE][dD]|[aA][gG][eE])?\\b)[^\\n]{0,200}(?:[dD][iI][rR][eE][cC][tT](?:[lL][yY])?|[nN][oO][nN]-?[dD][rR][aA][fF][tT]|[nN][oO][tT] (?:[aA] )?[dD][rR][aA][fF][tT]|[wW][iI][tT][hH][oO][uU][tT] (?:[aA] )?[dD][rR][aA][fF][tT])|(?:[dD][iI][rR][eE][cC][tT](?:[lL][yY])?|[nN][oO][nN]-?[dD][rR][aA][fF][tT]|[nN][oO][tT] (?:[aA] )?[dD][rR][aA][fF][tT]|[wW][iI][tT][hH][oO][uU][tT] (?:[aA] )?[dD][rR][aA][fF][tT])[^\\n]{0,200}(?:\\b[tT][eE][sS][tT][sS]?\\b|\\b[cC][oO][vV][eE][rR](?:[sS]|[eE][dD]|[aA][gG][eE])?\\b)))",
};
const SPREAD = {
  'plan-interface-kept-returns-after-queueing': ['- Every send goes through `EmailProtocol`.\n- No caller changes are needed if the queued implementation satisfies `EmailProtocol`.'],
  'plan-worker-delivers-mock-local-test-ses-elsewhere': ['- A separate worker delivers the mail.\n- The mock client is chosen by `get_email_repo()`; the worker reuses it.\n- The local `ENV` is `local`; tests use `ENV=test`.\n- Elsewhere the real SES client is used.'],
  'plan-eager-in-test-environment': ['- Tests: `task_always_eager=True` when `config.ENV == Env.test`.'],
  'plan-broker-queue-from-settings-localstack-defaults': ['- `src/config.py`: add `CELERY_BROKER_URL` and `CELERY_QUEUE_NAME`.\n- Their defaults point at LocalStack.'],
  'plan-initiator-may-be-empty': ['- Columns: `triggered_by_employee_id` (nullable FK, `ondelete="SET NULL"`).'],
  'plan-five-kinds': ['- `NotificationKind`: `new_recognition`, `unresolved_issues`, `new_rounding_template`, `overdue_template`, `rounding_reminder`.'],
  'plan-tests-cover-both-paths': ['- `tests/test_notifications.py` (new):\n  - direct create with 3 recipients gives 3 notifications\n  - `send-and-save` of drafts gives one per recipient'],
};
// The value is absent (or only a substring of another word): both the old and the new pattern must fail.
const ABSENT = {
  'plan-interface-kept-returns-after-queueing': ['- The interface is replaced by an async API.\n- Jobs go to the queue.', '- Callers are rewritten.\n- Nothing is queued: the call blocks.'],
  'plan-worker-delivers-mock-local-test-ses-elsewhere': ['- Mail is sent from the request; the client is boto3.'],
  'plan-eager-in-test-environment': ['- Tasks run in a worker.\n- A broker is required in tests.'],
  'plan-broker-queue-from-settings-localstack-defaults': ['- The broker is hard-coded.\n- A rebroker option exists.'],
  'plan-initiator-may-be-empty': ['- Columns: `initiator_id` (required).\n- Description: free text.'],
  'plan-five-kinds': ['- `NotificationKind`: `new_recognition`, `unresolved_issues`, `overdue_template`.'],
  'plan-tests-cover-both-paths': ['- `tests/test_notifications.py` (new): a direct create gives 3 notifications.'],
};

describe('chain cases: the seven graders that missed spread-out and snake_case values', () => {
  const byName = Object.fromEntries(Object.values(PLAN_VALUES).flat().map((g) => [g.name, g]));
  for (const name of Object.keys(OLD_SEVEN)) {
    it(`${name}: the old pattern misses the value, the new one finds it; an absent value fails both`, () => {
      const old = { pattern: OLD_SEVEN[name] };
      SPREAD[name].forEach((plan, i) => {
        assert.ok(!grade(old, plan), `old pattern should miss spread sample ${i}`);
        assert.ok(grade(byName[name], plan), `new pattern should match spread sample ${i}`);
      });
      ABSENT[name].forEach((plan, i) => {
        assert.ok(!grade(old, plan), `old pattern, absent sample ${i}`);
        assert.ok(!grade(byName[name], plan), `new pattern should not match absent sample ${i}`);
      });
    });
  }
});

// tasks-deliver-email: the task case asked for a task decorator and `Ses|Client` among the added lines. A run that left the existing sender alone (the task calls
// the untouched `get_email_repo()`) failed it. The patterns below are the task case's, verbatim, from the local file.
const OLD_TASKS_DELIVER = '^(?=[\\s\\S]*(?:\\.task\\b|shared_task|\\w+_task\\())(?=[\\s\\S]*(?:[Ss]es|[Cc]lient))';
const added = (file, ...lines) => `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join('\n')}\n`;
const DIFFS = {
  'the task calls the untouched sender': added('src/services/celery/email_tasks.py', 'from src.adapters.repositories.email_repo import get_email_repo', '', '@celery_app.task(name="email.send_registration_email")', 'def send_registration_email(payload):', '    return get_email_repo().send_registration_email(payload)'),
  'the task builds the client itself (reference shape)': added('src/celery/tasks/email.py', '@celery_app.task(name="send_registration_email", pydantic=True)', 'def send_registration_email(request):', '    return send_templated_email(request)', '', 'def send_templated_email(request):', '    return get_email_client().send_email(**request)'),
};
const NO_DELIVERY = {
  'no task at all': added('src/adapters/repositories/email_repo.py', 'def helper():', '    return 1'),
  'a task that only logs': added('src/celery/tasks/reports.py', '@celery_app.task(name="daily_report")', 'def daily_report():', '    logger.info("daily report triggered")'),
  'an empty diff (nothing was done)': '',
  'the word Ses inside another word': added('src/celery/tasks/x.py', '@celery_app.task', 'def uses_cache():', '    return "responses"'),
};

describe('chain cases: tasks-deliver-email judges the delivery the task makes, not the word SES', () => {
  const real = { name: 'task-real-k12-celery-email', slug: 'rl-x', repo: 'r1', graders: [{ kind: 'diff', name: 'tasks-deliver-email', pattern: OLD_TASKS_DELIVER, weight: 2, in: '^src/' }, { kind: 'diff', name: 'celery-app-created', pattern: 'Celery\\(', in: '^src/' }], relevant: [], allowed: [], limits: { max_turns: 10, timeout_seconds: 10 }, kind: 'infra', description: 'd', prompt: 'p', parent: 'a'.repeat(40), commit: 'b'.repeat(40) };
  const root = mkdtempSync(path.join(tmpdir(), 'chain-diff-'));
  writeChain({ evalsDir: root, sources, cases: [real] });
  const truth = JSON.parse(read(root, 'bare', 'task-chain', '01-task-real-k12-celery-email-chain', 'truth.json'));
  const grader = truth.diffGraders.find((g) => g.name === 'tasks-deliver-email');

  it('the chain truth carries the replaced pattern; weight, scope and every other diff grader are the case\'s own', () => {
    assert.notEqual(grader.pattern, OLD_TASKS_DELIVER);
    assert.equal(grader.weight, 2);
    assert.equal(grader.in, '^src/');
    assert.equal(truth.diffGraders.find((g) => g.name === 'celery-app-created').pattern, 'Celery\\(');
  });
  it('a run that left the sender as it was passes; the reference shape passes; the old pattern failed the first', () => {
    assert.equal(gradeOne({ ...grader, pattern: OLD_TASKS_DELIVER }, DIFFS['the task calls the untouched sender']).passed, false);
    for (const [label, diff] of Object.entries(DIFFS)) assert.equal(gradeOne(grader, diff).passed, true, label);
  });
  it('no task, a task that does not deliver, no diff and a substring of another word all fail', () => {
    for (const [label, diff] of Object.entries(NO_DELIVERY)) assert.equal(gradeOne(grader, diff).passed, false, label);
  });
});

// mock-client-kept-for-local-and-test: the case's pattern (mock and Env.test|local among the added lines) is the old verdict; keptIf adds "left as it was".
const OLD_MOCK_KEPT = '^(?=[\\s\\S]*[Mm]ock)(?=[\\s\\S]*Env\\.(?:test|local))';
const edit = (file, removed, ...addedLines) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,5 +1,5 @@\n ctx\n${removed.map((l) => `-${l}`).join('\n')}${removed.length ? '\n' : ''}${addedLines.map((l) => `+${l}`).join('\n')}${addedLines.length ? '\n' : ''} ctx\n`;
const TASK_MODULE = added('src/services/celery/email_tasks.py', '@celery_app.task(name="email.send_registration_email")', 'def send_registration_email(payload):', '    return get_email_repo().send_registration_email(payload)');
const SELECTION = ['def get_email_repo() -> EmailRepo:', '    if config.ENV in (Env.local, Env.test):', '        return EmailRepo(SESClientMock())'];
const MOCK_DIFFS = {
  pass: {
    'selection untouched, only the module-level instance dropped (the archived 11-46-59 chain run)': TASK_MODULE + edit('src/adapters/repositories/email_repo.py', ['email_repo = get_email_repo()']),
    'selection moved into the task module (reference shape)': edit('src/adapters/repositories/email_repo.py', SELECTION) + added('src/celery/tasks/email.py', '@celery_app.task(name="send_registration_email")', 'def send_registration_email(request):', '    return get_email_client().send_email(**request)', '', 'def get_email_client():', '    if config.ENV in (Env.local, Env.test):', '        return SESClientMock()'),
  },
  fail: {
    'selection removed and not re-added': TASK_MODULE + edit('src/adapters/repositories/email_repo.py', SELECTION, 'def get_email_repo() -> EmailRepo:', '    return EmailRepo(boto3.client("sesv2"))'),
    'selection removed while the task module is added': TASK_MODULE + edit('src/adapters/repositories/email_repo.py', ['    if config.ENV in (Env.local, Env.test):']),
    'nothing selects a mock and no task delivers': edit('src/adapters/repositories/email_repo.py', ['x = 1'], 'x = 2'),
    'a task that delivers nothing, selection untouched': added('src/celery/tasks/reports.py', '@celery_app.task(name="daily_report")', 'def daily_report():', '    logger.info("triggered")'),
    'an empty diff': '',
  },
};

describe('chain cases: mock-client-kept-for-local-and-test accepts a selection the task left as it was', () => {
  const override = DIFF_GRADER_OVERRIDES['task-real-k12-celery-email']['mock-client-kept-for-local-and-test'];
  const base = { name: 'mock-client-kept-for-local-and-test', pattern: OLD_MOCK_KEPT, weight: 1, in: '^src/' };
  const real = { name: 'task-real-k12-celery-email', slug: 'rl-x', repo: 'r1', graders: [{ kind: 'diff', ...base }, { kind: 'diff', name: 'celery-app-created', pattern: 'Celery\\(', in: '^src/' }], relevant: [], allowed: [], limits: { max_turns: 10, timeout_seconds: 10 }, kind: 'infra', description: 'd', prompt: 'p', parent: 'a'.repeat(40), commit: 'b'.repeat(40) };
  const root = mkdtempSync(path.join(tmpdir(), 'chain-mock-'));
  writeChain({ evalsDir: root, sources, cases: [real] });
  const truth = JSON.parse(read(root, 'bare', 'task-chain', '01-task-real-k12-celery-email-chain', 'truth.json'));
  const grader = truth.diffGraders.find((g) => g.name === base.name);

  it('the chain truth carries keptIf and the case\'s own pattern, scope and weight; other diff graders carry no keptIf', () => {
    assert.deepEqual(grader.keptIf, override.keptIf);
    assert.equal(grader.pattern, OLD_MOCK_KEPT);
    assert.equal(grader.in, '^src/');
    assert.equal(truth.diffGraders.find((g) => g.name === 'celery-app-created').keptIf, undefined);
  });
  it('the old grader (no keptIf) fails the untouched-selection run; the new one passes it, the reference shape, and fails the rest', () => {
    assert.equal(gradeOne(base, MOCK_DIFFS.pass['selection untouched, only the module-level instance dropped (the archived 11-46-59 chain run)']).passed, false);
    for (const [label, diff] of Object.entries(MOCK_DIFFS.pass)) assert.equal(gradeOne(grader, diff).passed, true, label);
    for (const [label, diff] of Object.entries(MOCK_DIFFS.fail)) assert.equal(gradeOne(grader, diff).passed, false, label);
  });
  it('a grader without keptIf is judged and explained byte-for-byte as before, and removed lines never rescue it', () => {
    const plain = gradeOne(base, TASK_MODULE);
    assert.equal(plain.explanation, `no match for ${OLD_MOCK_KEPT} in files ^src/`);
    assert.equal(gradeOne({ name: 'n', pattern: 'x', match: 'not_contains' }, added('src/a.py', 'y')).passed, true);
    assert.equal(gradeOne({ name: 'n', pattern: 'x', match: 'not_contains', keptIf: override.keptIf }, added('src/a.py', 'x')).passed, false, 'keptIf is for contains graders only');
  });
});

// Review fixes: the kept branch needs delivery through the existing selector; removed lines are read in the selection's file only; a task and its delivery share a file.
describe('chain cases: review fixes to tasks-deliver-email and mock-client-kept-for-local-and-test', () => {
  const REPO = 'src/adapters/repositories/email_repo.py';
  const base = (name, pattern) => ({ kind: 'diff', name, pattern, weight: 1, in: '^src/' });
  const real = { name: 'task-real-k12-celery-email', slug: 'rl-x', repo: 'r1', graders: [base('tasks-deliver-email', OLD_TASKS_DELIVER), base('mock-client-kept-for-local-and-test', OLD_MOCK_KEPT)], relevant: [], allowed: [], limits: { max_turns: 10, timeout_seconds: 10 }, kind: 'infra', description: 'd', prompt: 'p', parent: 'a'.repeat(40), commit: 'b'.repeat(40) };
  const root = mkdtempSync(path.join(tmpdir(), 'chain-review-'));
  writeChain({ evalsDir: root, sources, cases: [real] });
  const truth = JSON.parse(read(root, 'bare', 'task-chain', '01-task-real-k12-celery-email-chain', 'truth.json'));
  const deliver = truth.diffGraders.find((g) => g.name === 'tasks-deliver-email');
  const kept = truth.diffGraders.find((g) => g.name === 'mock-client-kept-for-local-and-test');
  const task = (...lines) => added('src/services/celery/email_tasks.py', '@celery_app.task(name="email.send_registration_email")', 'def send_registration_email(payload):', ...lines);
  const viaRepo = task('    return get_email_repo().send_registration_email(payload)');

  it('a task that builds its own boto3 client while get_email_repo() is unused does not pass the kept branch (it still passes tasks-deliver-email)', () => {
    const direct = task('    return boto3.client("sesv2").send_email(**payload)') + edit(REPO, ['email_repo = get_email_repo()']);
    assert.equal(gradeOne(kept, direct).passed, false);
    assert.equal(gradeOne(deliver, direct).passed, true);
  });
  it('widening the selection in email_repo.py is a kept selection; so is removing a mock comment in another file', () => {
    const widened = edit(REPO, ['    if config.ENV in (Env.local, Env.test):'], ['    if config.ENV in (Env.local, Env.test, Env.dev):']);
    assert.equal(gradeOne(kept, viaRepo + widened).passed, true);
    assert.equal(gradeOne(kept, viaRepo + edit('src/services/notes.py', ['# mock only in tests'], [])).passed, true);
  });
  it('the selection removed from email_repo.py and not re-added fails', () => {
    assert.equal(gradeOne(kept, viaRepo + edit(REPO, SELECTION)).passed, false);
  });
  it('a task in one file and the delivery call only in another fails tasks-deliver-email; both in one file passes', () => {
    const split = added('src/celery/tasks/a.py', '@celery_app.task(name="x")', 'def x():', '    pass') + added('src/adapters/b.py', 'def go():', '    return get_email_repo().send_registration_email(1)');
    assert.equal(gradeOne(deliver, split).passed, false);
    assert.equal(gradeOne(deliver, viaRepo).passed, true);
  });
  it('the kept branch wants the task and get_email_repo( in one file', () => {
    const split = added('src/celery/tasks/a.py', '@celery_app.task(name="x")', 'def x():', '    pass') + added('src/adapters/b.py', 'def go():', '    return get_email_repo().send_registration_email(1)');
    assert.equal(gradeOne(kept, split).passed, false);
  });
  it('the reference shape passes both graders; an empty diff fails both', () => {
    for (const diff of Object.values(MOCK_DIFFS.pass).slice(1)) assert.equal(gradeOne(kept, diff).passed, true);
    assert.equal(gradeOne(deliver, DIFFS['the task builds the client itself (reference shape)']).passed, true);
    assert.equal(gradeOne(deliver, '').passed, false);
    assert.equal(gradeOne(kept, '').passed, false);
  });
  it('the other diff graders of the case carry none of the new options', () => {
    const plain = JSON.parse(read(root, 'bare', 'task-chain', '01-task-real-k12-celery-email-chain', 'truth.json')).diffGraders;
    for (const g of plain.filter((one) => !['tasks-deliver-email', 'mock-client-kept-for-local-and-test'].includes(one.name))) assert.deepEqual(Object.keys(g).filter((k) => ['keptIf', 'perFile'].includes(k)), []);
  });
});

describe('chain cases: a suite ticket with frozen material and no plan values', () => {
  const material = mkdtempSync(path.join(tmpdir(), 'chain-material-'));
  mkdirSync(path.join(material, '.ambicode'));
  const real = { name: 'task-k12-1016', repo: 'r1', kind: 'feature', slug: 'k12-1016', commit: 'a'.repeat(40), parent: 'b'.repeat(40), description: 'Suite.', prompt: 'Do it.', relevant: ['src/a.py'], allowed: [], material,
    graders: [{ kind: 'diff', name: 'd-one', pattern: 'x', weight: 2 }, { kind: 'llm', name: 'design', rubric: 'PASS if ok.' }] };
  const root = mkdtempSync(path.join(tmpdir(), 'chain-suite-'));
  const rows = writeChain({ evalsDir: root, sources, cases: [real] });
  writeTask({ evalsDir: root, sources, cases: [real], stamps: ['S'], env: harvested(root, 'S', 'k12-1016c').env });
  const dir = (arm, n) => path.join(root, arm, 'task-chain', n);

  it('is a chain ticket: stage 1 is graded on plan-accepted alone, and every arm of it renders', () => {
    assert.deepEqual(rows, [{ name: 'task-k12-1016-chain-plan', planGraders: 1 }]);
    assert.deepEqual(readdirSync(path.join(dir('cases', '03-task-k12-1016-chain-plan'), 'graders')), ['plan-accepted.md']);
    assert.deepEqual(readdirSync(path.join(root, 'cases', 'task-chain')).sort(), ['03-task-k12-1016-chain', '03-task-k12-1016-chain-plan']);
  });

  it('the plugin scaffolds copy the case\'s frozen .ambicode, not the bench\'s; the bare one has none', () => {
    for (const name of ['03-task-k12-1016-chain-plan', '03-task-k12-1016-chain']) {
      const script = read(dir('cases', name), 'scaffold.sh');
      assert.ok(script.includes(`cp -R '${path.join(material, '.ambicode')}'/. .ambicode/\n`), name);
      assert.doesNotMatch(script, /\/bench\/r1\/\.ambicode/);
    }
    assert.doesNotMatch(read(dir('bare', '03-task-k12-1016-chain'), 'scaffold.sh'), /\.ambicode/);
  });

  it('stage 2 keeps the diff graders as truth, found by run.mjs under the -chain name whatever its prefix', () => {
    assert.deepEqual(realTruth('task-k12-1016-chain', root).diffGraders.map((g) => g.name), ['d-one']);
    assert.equal(realTruth('task-k12-1016-chain-plan', root), null);
  });

  it('the case\'s remove list is dropped before the commit in every chain scaffold, as in suite-real', () => {
    const own = mkdtempSync(path.join(tmpdir(), 'chain-remove-'));
    writeChain({ evalsDir: own, sources, cases: [{ ...real, remove: ['.claude/rules/security.md'] }] });
    for (const [tree, name] of [['cases', '03-task-k12-1016-chain-plan'], ['bare', '03-task-k12-1016-chain']]) assert.match(read(path.join(own, tree, 'task-chain', name), 'scaffold.sh'), /\nrm -f '\.claude\/rules\/security\.md'\ngit init/, name);
    assert.doesNotMatch(read(dir('bare', '03-task-k12-1016-chain'), 'scaffold.sh'), /rm -f/);
  });

  it('a suite diff grader\'s perFile reaches the chain truth.json, as it does the suite-real one', () => {
    const own = mkdtempSync(path.join(tmpdir(), 'chain-perfile-'));
    const withPer = { ...real, graders: [{ kind: 'diff', name: 'd-per', pattern: 'x', perFile: true }, { kind: 'diff', name: 'd-pool', pattern: 'y' }] };
    writeChain({ evalsDir: own, sources, cases: [withPer] });
    const truth = JSON.parse(read(path.join(own, 'bare', 'task-chain', '03-task-k12-1016-chain'), 'truth.json'));
    assert.deepEqual(truth.diffGraders.map((g) => g.perFile), [true, undefined]);
  });
});
