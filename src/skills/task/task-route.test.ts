import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runHook } from '#hook/events/run-hook';
import { launchRoute } from '#hook/events/prompt-launch';
import { createRuntime } from '#composition/root';
import { gapsOf } from '#modules/evidence/report/report';
import { stepHeader } from '#harness/engine/execute';
import { delegatedStepOf, buildChain } from '#harness/engine/fold';
import { runCheckCommand, renderCheck, CHECK_OPTIONS } from '#cli/commands/checks/check';
import { parseArgs } from '#util/args';
import { shellQuote } from '#modules/checks/run/run';
import { COMMAND_PACK, CHECK_CONFIG, CHECK_TASK } from '#testing/fixtures/check-fixture';
import { finding } from '#testing/fixtures/review-fixture';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { appendLedger } from '#platform/ledger/ledger';
import { REPO_ROOT } from '#testing/paths';
import { SESSION_A } from '#testing/fixtures/ids';

type Fixture = Awaited<ReturnType<typeof taskFixture>>;

const RULE_PACKS = ['code', 'design', 'errors', 'security', 'verification'].map((name) => `builtin/common-${name}`).join(', ');
/** The task fixture with the common packs on, so the before-work policy is a real payload and not an empty string. */
const WITH_RULES = { config: CHECK_CONFIG.replace('    policyFiles:', `    packs: [${RULE_PACKS}]\n    policyFiles:`) };
const ruleIds = (text: string): string[] => [...new Set(text.match(/common-[a-z]+\/[a-z0-9-]+/g) ?? [])].sort();

const OTHER = { oldPath: 'src/other.ts', newPath: 'src/other.ts', side: 'new' as const, line: 1 };

async function withTask(body: (t: Fixture) => Promise<void>, options: Parameters<typeof taskFixture>[0] = {}): Promise<void> {
  const t = await taskFixture(options);
  try {
    await body(t);
  } finally {
    await t.fx.dispose();
  }
}

/** change → green check (format runs by itself), landing on the review offer. */
async function toOffer(t: Fixture, start: Parameters<Fixture['start']>[0] = {}) {
  await t.start(start);
  await t.edit();
  return t.check('green', { ran: 1, failed: 0 });
}

const section = (text: string, name: string): string => text.split(`## ${name}\n`)[1]?.split('\n\n## ')[0] ?? '';
const delivered = async (t: Fixture, step: string): Promise<number> => (await t.kinds('step')).filter((entry) => entry['step'] === step && entry['status'] === 'delivered').length;
const prints = async (t: Fixture, gate?: string) => (await t.kinds('gate')).filter((entry) => gate === undefined || entry['gate'] === gate);

describe('task route (07-R, 07-V, 07-G)', { concurrency: 4 }, () => {
  it('07-R1: the shipped route declares its steps in order, the raised registry gates and 5 model steps', async () => {
    await withTask(async (t) => {
      const def = t.fx.routes.route('task')!;
      assert.deepEqual(def.steps.map((step) => step.id), ['fetch', 'start', 'ground', 'map-seeded', 'map-request', 'rules', 'change', 'format', 'review-offer', 'brief', 'review-agent', 'review-record', 'review-run', 'fix', 'report-step', 'next', 'write']);
      assert.equal(def.steps.filter((step) => step.actor === 'model').length, 5);
      assert.ok(t.fx.routes.gate('check-only-unauthorized') != null);
      for (const gone of ['review-checks', 'scope-expanding']) assert.equal(t.fx.routes.gate(gone) ?? null, null, `${gone} is not a gate`);
    });
  });

  // The fixture's default request names iteration 1; this one leaves the choice to the route.
  const UNNAMED = 'fix `total` for an empty list';

  it('07-R2: the brief is the first iteration whose route did not exit done; past the last one the route exits iterations-complete', async () => {
    const plan = '.ambicode/tasks/ord-7/plan.md';
    const finished = async (t: Fixture, iteration: number): Promise<void> => {
      await t.fx.runtime.fs.mkdirp(t.dir);
      await appendLedger(t.fx.runtime.fs, t.dir, t.fx.runtime.clock.now(), { kind: 'step', route: `done-${iteration}`, step: 'start', actor: 'code', status: 'completed', cause: 'start', iteration });
      await appendLedger(t.fx.runtime.fs, t.dir, t.fx.runtime.clock.now(), { kind: 'exit', route: `done-${iteration}`, reason: 'done' });
    };
    await withTask(async (t) => {
      await t.fx.repo.write(plan, '# Plan\n\n## Iteration 1\nAdd the guard.\n\n## Iteration 2\nSeed the reduce.\n');
      await finished(t, 1);
      const red = await t.start({ plan, text: UNNAMED });
      const work = await t.work();
      assert.match(work, /iteration 2 of 2 · plan: \.ambicode\/tasks\/ord-7\/plan\.md\n\n## Iteration 2\nSeed the reduce\./);
      assert.doesNotMatch(work, /Add the guard/);
      assert.doesNotMatch(red.text, /Seed the reduce/);
      const record = (await t.kinds('step')).find((entry) => entry['step'] === 'start' && entry['route'] !== 'done-1');
      assert.deepEqual([record?.['planPath'], record?.['iteration'], record?.['iterations']], [plan, 2, 2]);
    });
    await withTask(async (t) => {
      await t.fx.repo.write(plan, '# Plan\n\n## Iteration 1\nAdd the guard.\n');
      await finished(t, 1);
      assert.equal((await t.start({ plan, text: UNNAMED })).position, 'complete');
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'iterations-complete');
      const record = (await t.kinds('step')).find((entry) => entry['step'] === 'start' && entry['route'] !== 'done-1');
      assert.equal(record?.['iteration'], undefined, 'no iteration 2 of 1 is recorded');
      assert.equal(record?.['iterations'], 1);
    });
    await withTask(async (t) => {
      await finished(t, 1);
      assert.equal((await t.start({ text: UNNAMED })).position, 'change', 'a request with no plan has no iterations to run out of');
    });
  });

  it('B8: the task map is seeded from the iteration brief, never from the "iteration N of slug" request', async () => {
    const plan = '.ambicode/tasks/ord-7/plan.md';
    await withTask(async (t) => {
      await t.fx.repo.write('src/seeded/reducer.ts', 'export function reduceTotals(): number {\n  return 1;\n}\n');
      await t.fx.repo.commitAll('seeded file');
      await t.fx.repo.write(plan, '# Plan\n\n## Iteration 1\nChange `reduceTotals` in src/seeded/reducer.ts:1.\n');
      await t.start({ plan, text: 'iteration 1 of ord-7' });
      const map = (await t.kinds('map')).at(-1)!;
      const terms = (map['terms'] as { pass1: string[] }).pass1;
      assert.ok(terms.includes('reduceTotals'), terms.join(','));
      assert.ok(!terms.some((term) => /^iteration$/i.test(term)), terms.join(','));
      assert.ok(Number(map['candidates']) > 0, JSON.stringify(map));
    });
  });

  it('a prose request with no plan or investigation gets a map from the retrieval layers; a seeded one keeps the context map', async () => {
    await withTask(async (t) => {
      await t.fx.repo.write('src/billing/invoice-totals.ts', 'export function reduceInvoiceTotals(): number {\n  return 1;\n}\n');
      await t.fx.repo.commitAll('invoice totals');
      await t.start({ text: 'Fix the invoice totals so that rounding matches the billing statement' });
      const map = (await t.kinds('map')).at(-1)!;
      assert.ok(Number(map['candidates']) > 0, JSON.stringify(map));
      assert.match(await t.work(), /## map\nMap: [\s\S]*src\/billing\/invoice-totals\.ts/);
      const skipped = (await t.kinds('step')).filter((entry) => entry['status'] === 'skipped').map((entry) => entry['step']);
      assert.ok(skipped.includes('map-seeded') && !skipped.includes('map-request'), skipped.join(','));
    });
  });

  it('07-R4/07-G1/07-G2: ground records baseline, map and both policy stages in order, under 9 KiB', async () => {
    await withTask(async (t) => {
      await t.fx.repo.write('src/other.ts', 'export function total(): number {\n  return 1;\n}\n');
      await t.fx.repo.commitAll('a second total');
      const red = await t.start();
      const order = (await t.ledger()).map((entry) => (entry.kind === 'policy' ? `policy:${entry['stage']}` : entry.kind === 'step' ? `step:${entry['step']}` : entry.kind));
      const at = (name: string): number => order.indexOf(name);
      assert.ok(at('baseline') < at('map') && at('map') < at('policy:before-work') && at('policy:before-work') < at('step:rules'), order.join(' '));
      assert.doesNotMatch(red.text, /git grep|Callers/);
      assert.ok(Buffer.byteLength(red.text) <= 9 * 1024, `${Buffer.byteLength(red.text)} bytes`);
    });
  });

  it('07-R6/D4: a red-phase check is no green evidence; a green-phase check with exit 0 ends change and format runs itself', async () => {
    await withTask(async (t) => {
      await t.start();
      assert.equal((await t.check('red', { ran: 1, failed: 1 })).position, 'change', 'a red check is no green evidence');
      assert.equal((await t.check('green', { ran: 0, failed: 0 })).position, 'review-offer', 'the green check ends change and format runs itself');
    });
  });

  it('a green-phase check with a nonzero exit leaves change open with "Not done yet"; a passing one then advances', async () => {
    await withTask(async (t) => {
      await t.start();
      const failed = await t.check('green', null, 1);
      assert.equal(failed.position, 'change');
      assert.match(failed.text, /Not done yet: check\{green\} is not on record/);
      assert.equal((await t.check('green', null, 0)).position, 'review-offer');
    });
  });

  it('a red green-phase check answers with the missing record and the command, not the whole step again', async () => {
    await withTask(async (t) => {
      const first = await t.start();
      const failed = await t.check('green', null, 1);
      assert.match(failed.text, /Not done yet: check\{green\} is not on record/);
      assert.match(failed.text, /check --task \S+ --name <key> --file <file> --phase green/);
      assert.doesNotMatch(failed.text, /<check>|<spec>/);
      assert.ok(failed.bytes < first.bytes / 2, `${failed.bytes} B after a red check vs ${first.bytes} B for the step`);
      assert.doesNotMatch(failed.text, /## checks\.runnable/);
      assert.match(await t.work(), /## checks\.runnable/, 'the work file still carries the runnable checks');
    });
  });

  it('CHECK_LIMIT failing greens release change with the gap in Not verified, never a dead end', async () => {
    await withTask(async (t) => {
      await t.start();
      for (let run = 0; run < 5; run += 1) {
        assert.equal((await t.runCheck({ phase: 'green' })).outcome, 'ran');
        assert.equal((await t.next({ cause: 'check' })).position, 'change');
      }
      await assert.rejects(t.runCheck({ phase: 'green' }), /check-limit|already ran/);
      assert.equal((await t.next({ cause: 'route-next' })).position, 'review-offer');
      assert.match(gapsOf(await t.ledger()).join('\n'), /Checks kept failing during the change: stopped after 5 attempts/);
    });
  });

  it('the change step only launches the implementer on the work file: no payload, no policy text, the brief and rules in the file', async () => {
    await withTask(async (t) => {
      const change = await t.start();
      const work = await t.work();
      assert.match(change.text, /Launch the `ambicode:implementer` subagent on .+work-change\.md/);
      assert.doesNotMatch(change.text, /hook prints/);
      assert.match(change.text, /run_in_background: false/, "a background launch ended the turn and the Stop hook closed the route under the implementer");
      const launched = /Implement the work described in (.+work-change\.md)\./.exec(change.text)?.[1] ?? '';
      assert.ok(path.isAbsolute(launched), `the launch names the work file by an absolute path: ${launched}`);
      assert.equal(await realpath(launched), await realpath(path.join(t.dir, 'steps', 'work-change.md')));
      assert.doesNotMatch(change.text, /## (brief|envelope|baseline|map|policy|checks|context)|Rules \(/);
      assert.match(work, /^<!-- ambicode work: task\/change[\s\S]*# Work brief[\s\S]*## brief\n/);
      assert.match(section(work, 'brief'), /plan: none \(the request is the brief\)$/, 'a plan-less brief is its header; the request has its own section');
      assert.match(section(work, 'request'), /^fix `total` for an empty list iteration 1$/);
      assert.match(work, /--phase green`/);
      assert.doesNotMatch(work, /--phase green -/, 'no flag follows the phase');
      assert.ok(change.bytes < work.length, `${change.bytes} B message vs ${work.length} B work file`);
      const policy = await readdir(path.join(t.dir, 'steps')).then((names) => names.find((name) => name.endsWith('-policy-before-work.md')));
      const rules = policy === undefined ? '' : (await readFile(path.join(t.dir, 'steps', policy), 'utf8')).trim();
      assert.notEqual(rules, '', 'the rules fixture staged a policy');
      assert.ok(work.includes(rules) && !change.text.includes(rules));
    }, WITH_RULES);
  });

  it('change and fix carry the runnable check keys, and their texts tell the model to use one of them', async () => {
    await withTask(async (t) => {
      const change = await t.start();
      const runnable = /## checks\.runnable\nProject app: e2e \(--file needs approval\), typecheck \(all needs approval\), unit \(--file runs freely, all needs approval\)\./;
      assert.match(await t.work(), runnable);
      assert.match(await t.work(), /key listed under `checks\.runnable`/);
      assert.doesNotMatch(change.text, /## checks\.runnable/);
      await t.edit();
      await t.check('green', null);
      await t.hook('review-offer', 'run');
      const fix = await t.review([finding({ id: 'F1' })]);
      assert.equal(fix.position, 'fix');
      assert.match(await t.work('fix'), runnable);
      assert.match(await t.work('fix'), /key listed under `checks\.runnable`/);
      assert.doesNotMatch(fix.text, /## checks\.runnable/);
    });
  });

  it('a project with no check that can run is not blocked: change needs no green check and the baseline records zero runnable', async () => {
    const config = CHECK_CONFIG.replace(/ {4}checks:\n(?: {6}.*\n)+/, '    checks: { unit: { all: null, file: null } }\n');
    await withTask(async (t) => {
      const started = await t.start();
      assert.equal(started.position, 'change');
      assert.deepEqual(await t.kinds('exit'), []);
      assert.equal((await t.kinds('baseline'))[0]?.['runnable'], 0);
      await t.edit();
      const done = await t.next();
      assert.equal(done.position, 'review-offer');
      assert.equal((await t.kinds('check')).length, 0);
    }, { config });
  });

  it('a project whose only command is format has no runnable check and is not blocked either', async () => {
    const config = CHECK_CONFIG.replace(/ {4}checks:\n(?: {6}.*\n)+/, '    checks: { unit: { all: null, file: null }, format: { all: null, file: "fmt {file}" } }\n');
    await withTask(async (t) => {
      assert.equal((await t.start()).position, 'change');
      assert.equal((await t.kinds('baseline'))[0]?.['runnable'], 0);
    }, { config });
  });

  it('a project with a runnable check still holds change open until a green check is recorded', async () => {
    await withTask(async (t) => {
      await t.start();
      await t.edit();
      assert.equal((await t.next()).position, 'change');
      assert.equal((await t.kinds('baseline'))[0]?.['runnable'], 3);
    });
  });

  it('07-R7/07-V4: headless, the offer defaults to skip; brief, review-agent, review-run and fix are skipped, no review runs, and the report says so', async () => {
    await withTask(async (t) => {
      const write = await toOffer(t, { headless: true });
      assert.equal(write.position, 'write');
      assert.equal((await t.kinds('default-taken')).find((entry) => entry['gate'] === 'review-offer')?.['answer'], 'skip — verification incomplete');
      const skipped = (await t.kinds('step')).filter((entry) => entry['status'] === 'skipped').map((entry) => entry['step']);
      assert.ok(['brief', 'review-agent', 'review-record', 'review-run', 'fix'].every((step) => skipped.includes(step)), skipped.join(' '));
      assert.equal((await t.kinds('review')).length, 0);
      assert.match(write.text, /independent review skipped — verification incomplete/);
    });
  });

  it('07-R7: on a trusted start, a model --answer review-offer=run is declined; a skip then runs no review', async () => {
    await withTask(async (t) => {
      await toOffer(t);
      const again = await t.next({ answers: [{ gate: 'review-offer', option: 'run' }] });
      assert.equal(again.position, 'review-offer');
      assert.deepEqual((await t.kinds('declined')).map((entry) => [entry['gate'], entry['reason']]), [['review-offer', 'acting-needs-human']]);
      assert.equal((await t.hook('review-offer', 'skip — verification incomplete')).position, 'write');
      assert.equal((await t.kinds('review')).length, 0);
    });
  });

  it('07-R7: a trusted preanswer run is honoured at the gate, and the brief step pins the review before its script runs', async () => {
    await withTask(async (t) => {
      const run = await toOffer(t, { answers: [{ gate: 'review-offer', option: 'run' }] });
      assert.equal(run.position, 'review-agent');
      assert.match(await t.work('review-agent'), /brief: .*brief\.md/);
      assert.equal(await delivered(t, 'review-agent'), 1);
      const ledger = await t.ledger();
      const pinned = ledger.findIndex((entry) => entry.kind === 'review');
      const briefed = ledger.findIndex((entry) => entry.kind === 'step' && entry['step'] === 'brief' && entry['status'] === 'completed');
      assert.ok(pinned !== -1 && pinned < briefed, `review entry ${pinned} before brief completed ${briefed}`);
      const review = ledger[pinned]!;
      assert.deepEqual([review['stage'], review['reviewerRan'], review['baseline'] !== undefined, typeof review['route']], ['pending', false, true, 'string']);
      const dir = path.dirname(path.join(t.fx.repo.root, String(review['result'])));
      for (const file of ['brief.md', 'changed.diff', 'files.txt', 'result.json', 'report.txt']) await readFile(path.join(dir, file), 'utf8');
      const preanswer = (await t.kinds('preanswer'))[0];
      assert.deepEqual((await t.kinds('acceptance')).map((entry) => [entry['gate'], entry['answer'], entry['via'], entry['preanswer']]), [['review-offer', 'run', 'prompt', preanswer?.id]]);
    });
  });

  it('07-V3: a fix round asks review-again; run pins a new review once per answer and a skip records the fix as not re-reviewed', async () => {
    await withTask(async (t) => {
      await toOffer(t);
      assert.equal((await t.hook('review-offer', 'run')).position, 'review-agent');
      const fix = await t.review([finding({ id: 'F1' })]);
      assert.equal(fix.position, 'fix');
      assert.match(await t.work('fix'), /F1 src\/orders\.ts:2/);
      assert.doesNotMatch(fix.text, /F1 src\/orders/);
      const ask = await t.check('green', { ran: 1, failed: 0 });
      assert.equal(ask.position, 'report-step');
      assert.equal((await prints(t, 'review-again')).length, 1);
      const pinnedBefore = (await t.kinds('review')).filter((entry) => entry['stage'] === 'pending').length;
      const again = await t.hook('review-again', 'run');
      assert.equal(again.position, 'review-agent');
      assert.equal((await t.kinds('review')).filter((entry) => entry['stage'] === 'pending').length, pinnedBefore + 1, 'the revise pinned a new review');
      assert.equal((await t.review([finding({ id: 'F2' })])).position, 'fix');
      await t.check('green', { ran: 1, failed: 0 });
      assert.equal((await prints(t, 'review-again')).length, 2);
      assert.equal((await t.hook('review-again', 'skip')).position, 'write');
      assert.deepEqual((await t.kinds('revise')).map((entry) => entry['reason']), ['review-run: review-findings', 'review-again: run', 'review-run: review-findings']);
      assert.match(gapsOf(await t.ledger()).join('\n'), /fix not re-reviewed/);
    });
  });

  it('07-V5: the route review pin leaves the reviewer pending: review-agent gets the diff and brief paths, review record reaches review-run and its findings revise fix', async () => {
    await withTask(async (t) => {
      await toOffer(t);
      const agent = await t.hook('review-offer', 'run');
      assert.equal(agent.position, 'review-agent');
      assert.match(agent.text, /ambicode:reviewer/);
      assert.doesNotMatch(agent.text, /diff:|brief: /);
      assert.match(await t.work('review-agent'), /## script:brief\nbrief: .*brief\.md\nanswer: .*answer\.json/);
      assert.equal(await delivered(t, 'fix'), 0, 'a pending review has no findings to fix');
      const fix = await t.review([finding({ id: 'F1' })]);
      assert.equal(fix.position, 'fix');
      assert.match(await t.work('fix'), /F1 src\/orders\.ts:2/);
      assert.deepEqual((await t.kinds('review')).map((entry) => entry['stage']), ['pending', 'recorded']);
    });
  });

  it('the reviewer brief of a task carries the review rules whole, not the task rules cut at the stage cap', async () => {
    const packs = ['code', 'design', 'errors', 'security', 'verification'].map((name) => `builtin/common-${name}`).join(', ');
    await withTask(async (t) => {
      await toOffer(t);
      await t.hook('review-offer', 'run');
      const brief = await readFile(/brief: (.*brief\.md)/.exec(await t.work('review-agent'))![1]!, 'utf8');
      assert.match(brief, /common-security\/no-secret-exposure/);
      assert.doesNotMatch(brief, /more: `/);
    }, { config: CHECK_CONFIG.replace('    policyFiles:', `    packs: [${packs}]\n    policyFiles:`) });
  });

  it('07-V3: an unanswered review-again holds the route: no default is taken, no reviewer runs and no revise', async () => {
    await withTask(async (t) => {
      await toOffer(t);
      await t.hook('review-offer', 'run');
      await t.review([finding({ id: 'F1' })]);
      await t.check('green', { ran: 1, failed: 0 });
      for (let turn = 0; turn < 4; turn += 1) assert.equal((await t.next()).position, 'report-step');
      assert.equal((await t.kinds('default-taken')).length, 0);
      assert.deepEqual((await t.kinds('revise')).map((entry) => entry['reason']), ['review-run: review-findings']);
      assert.equal((await t.kinds('review')).length, 2, 'the pin and the recorded review, no third');
    });
  });

  it('07-V1: a finding outside the touched files goes to fix like any other: one rule, no scope question', async () => {
    await withTask(async (t) => {
      await toOffer(t);
      await t.hook('review-offer', 'run');
      const fix = await t.review([finding({ id: 'F1', location: OTHER })]);
      assert.equal(fix.position, 'fix');
      assert.match(await t.work('fix'), /F1 src\/other\.ts:1/);
      assert.equal((await prints(t, 'scope-expanding')).length, 0);
    });
  });

  it('07-R2: --plan sets the route args and change its hash; the slug comes from the plan\'s task directory', async () => {
    await withTask(async (t) => {
      await t.fx.repo.write('docs/plan.md', '# Plan\n');
      await t.start({ task: 'r-none' });
      await t.start({ task: 'r-plan', plan: 'docs/plan.md' });
      const args = async (task: string) => (await t.fx.kinds(task, 'route'))[0]?.['args'] as { plan: string | null; hash: string };
      const [none, plan] = [await args('r-none'), await args('r-plan')];
      assert.equal(plan.plan, 'docs/plan.md');
      assert.notEqual(none.hash, plan.hash);
      await t.fx.repo.write('.ambicode/tasks/ord-9/plan.md', '# Plan\n');
      await t.fx.engine.start({ skill: 'task', text: 'go', requirements: [], plan: '.ambicode/tasks/ord-9/plan.md', cwd: t.fx.repo.root, session: SESSION_A, channel: 'cli' });
      assert.equal((await t.fx.kinds('ord-9', 'route')).length, 1, 'the slug comes from the plan\'s task directory');
    });
  });

  it('07-R1: a UserPromptSubmit /ambicode:task with --plan starts the route at change, without prepare', async () => {
    await withTask(async (t) => {
      await t.fx.repo.write('docs/plan.md', '# Plan\n\nSeed the reduce.\n');
      const text = await launchRoute(t.fx.runtime, { hook_event_name: 'UserPromptSubmit', prompt: '/ambicode:task --task ord-7 --plan docs/plan.md fix total', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad } as never, { engine: t.fx.engine, routes: t.fx.routes }, { repositoryRoot: t.fx.repo.root, where: '.' });
      assert.match(text ?? '', /step change/);
      assert.doesNotMatch(text ?? '', /prepare/);
      assert.equal(((await t.kinds('route'))[0]?.['args'] as { plan: string }).plan, 'docs/plan.md');
    });
  });

  it('07-R8: ceremony — a skipped review asks 1–2 questions, one fix round 1–3', async () => {
    await withTask(async (t) => {
      await toOffer(t);
      await t.hook('review-offer', 'skip — verification incomplete');
      const asked = (await prints(t)).length;
      assert.ok(asked >= 1 && asked <= 2, `${asked}`);
    });
    await withTask(async (t) => {
      await toOffer(t);
      await t.hook('review-offer', 'run');
      await t.review([finding({ id: 'F1' })]);
      await t.check('green', { ran: 1, failed: 0 });
      assert.equal((await t.hook('review-again', 'skip')).position, 'write');
      const asked = (await prints(t)).length;
      assert.ok(asked >= 1 && asked <= 3, `${asked}`);
    });
  });

  it('B7: a task without a requirement needs no route next: the write step ends with the final message and Stop after the final message closes the route', async () => {
    await withTask(async (t) => {
      await toOffer(t);
      const write = await t.hook('review-offer', 'skip — verification incomplete');
      assert.equal(write.position, 'write');
      assert.doesNotMatch(write.text, /route next/);
      assert.notEqual(await t.fx.engine.deliver(CHECK_TASK, t.fx.scratchpad), null, 'a resume or another prompt does not close it');
      assert.equal((await t.kinds('exit')).length, 0);
      await t.fx.engine.stopHook({ hook_event_name: 'Stop', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad }, { repositoryRoot: t.fx.repo.root, where: '.' });
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'done');
    });
  });

  it('a headless session that stops mid-route ends it inconclusive at that step; an interactive one leaves it open', async () => {
    for (const headless of [true, false]) {
      await withTask(async (t) => {
        assert.equal((await t.start({ headless })).position, 'change');
        await t.fx.engine.stopHook({ hook_event_name: 'Stop', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad }, { repositoryRoot: t.fx.repo.root, where: '.' });
        const exits = await t.kinds('exit');
        if (headless) assert.deepEqual([exits.length, exits[0]?.['reason'], exits[0]?.['detail']], [1, 'inconclusive', 'the headless session stopped at step change']);
        else assert.equal(exits.length, 0);
      });
    }
  });

  it('a Stop while a background subagent runs leaves the route and its step files; once it returns the next Stop closes as before', async () => {
    await withTask(async (t) => {
      await t.start({ headless: true });
      const deps = { load: async () => ({ engine: t.fx.engine, routes: t.fx.routes }) };
      const send = (event: Record<string, unknown>) => runHook(t.fx.runtime, JSON.stringify({ session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad, ...event }), deps);
      const workFile = path.join(t.fx.repo.root, '.ambicode', 'tasks', CHECK_TASK, 'steps', 'work-change.md');
      await send({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_response: { content: [{ type: 'text', text: 'Async agent launched successfully.\nagentId: a8911c6a0944fb72c (internal ID)\nThe agent is working in the background.' }] } });
      await send({ hook_event_name: 'Stop' });
      assert.equal((await t.kinds('exit')).length, 0, 'the launching turn ended, the implementer is still running');
      assert.ok((await readFile(workFile, 'utf8')).length > 0);
      await send({ hook_event_name: 'SubagentStop', agent_id: 'a8911c6a0944fb72c' });
      await send({ hook_event_name: 'Stop' });
      assert.deepEqual((await t.kinds('exit')).map((entry) => entry['reason']), ['inconclusive']);
    });
  });

  it('B9: before-work reaches change', async () => {
    await withTask(async (t) => {
      const def = t.fx.routes.route('task')!;
      const payloadOf = (id: string): readonly string[] => def.steps.find((step) => step.id === id)!.payload;
      assert.ok(payloadOf('change').includes('policy:before-work'));
    });
  });

  it('07-R8: ceremony — a check under propose adds one question', async () => {
    await withTask(async (t) => {
      await t.start();
      await t.runCheck({ phase: 'green' });
      assert.deepEqual((await prints(t)).map((entry) => entry['gate']), ['check-only-unauthorized']);
    }, { pack: COMMAND_PACK.replace('{ command: unit, action: run, reason: "unit" }', '{ command: unit, action: propose, reason: "unit" }') });
  });

  it('07-R8: declining the question through the gate hook declines the check; it does not run', async () => {
    await withTask(async (t) => {
      await t.start();
      await t.runCheck({ phase: 'green' });
      await t.hook('check-only-unauthorized', 'decline');
      assert.deepEqual(await t.runCheck({ phase: 'green' }), { outcome: 'declined', key: 'app/unit' });
      assert.deepEqual(await t.kinds('check'), []);
    }, { pack: COMMAND_PACK.replace('{ command: unit, action: run, reason: "unit" }', '{ command: unit, action: propose, reason: "unit" }') });
  });

  it('07-R8: every task step text is at most 1,500 characters after inclusion; start ≤ 4 KiB, report ≤ 3 KiB', async () => {
    const cli = `node "${REPO_ROOT}/scripts/ambicode.mjs"`;
    for (const name of ['task/change', 'task/change-work', 'task/fix', 'task/fix-work', 'task/write']) {
      const text = (await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8')).replaceAll('{cli}', cli).replaceAll('{task}', CHECK_TASK);
      assert.ok(text.length <= 1500, `${name}: ${text.length}`);
    }
    await withTask(async (t) => {
      await t.fx.repo.write('docs/plan.md', `# Plan\n\n${'Seed the reduce with zero. '.repeat(400)}\n`);
      const red = await t.start({ plan: 'docs/plan.md' });
      const brief = section(await t.work(), 'brief');
      assert.ok(Buffer.byteLength(brief) <= 4096, `${Buffer.byteLength(brief)}`);
      assert.match(brief, /\[cut: read docs\/plan\.md\]$/);
      await t.edit();
      await t.check('green', { ran: 1, failed: 0 });
      const write = await t.hook('review-offer', 'skip — verification incomplete');
      assert.ok(Buffer.byteLength(section(write.text, 'report')) <= 3072);
      assert.doesNotMatch(section(write.text, 'report'), /ambicode report/);
    });
  });
});

describe('task route: the implementer returns', { concurrency: 4 }, () => {
  const returned = (t: Fixture, toolInput: Record<string, unknown> = { subagent_type: 'ambicode:implementer', prompt: 'Implement it' }) =>
    runHook(t.fx.runtime, JSON.stringify({ hook_event_name: 'PostToolUse', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad, tool_name: 'Agent', tool_input: toolInput, tool_response: { status: 'completed', content: [{ type: 'text', text: 'Changed:\n- src/orders.ts:2 seed the reduce' }] } }), { load: async () => ({ engine: t.fx.engine, routes: t.fx.routes }) });

  it('a held green check, then route next from the main session: format runs and the review offer prints', async () => {
    await withTask(async (t) => {
      await t.start();
      await t.edit();
      await t.held('green');
      assert.equal((await t.kinds('format')).length, 0, 'the held check did not run format');
      const next = await t.next();
      assert.match(next.text, /Run the independent review of this change\?/);
      assert.match(next.text, /\[ambicode gate review-offer /);
      assert.equal((await t.kinds('step')).find((entry) => entry['step'] === 'format')?.['cause'], 'route-next');
    });
  });

  it('the implementer returning prints nothing and writes nothing: the model runs route next itself', async () => {
    await withTask(async (t) => {
      await t.start();
      await t.edit();
      await t.held('green');
      const before = (await t.ledger()).map((entry) => entry.id);
      assert.deepEqual(await returned(t), {});
      assert.deepEqual((await t.ledger()).map((entry) => entry.id), before);
    });
  });

  it('three route next calls without a green check release the step as a gap', async () => {
    await withTask(async (t) => {
      await t.start();
      await t.edit();
      assert.match((await t.next()).text, /Not done yet: check\{green\}/);
      assert.match((await t.next()).text, /Not done yet: check\{green\}/);
      assert.equal((await t.next()).position, 'review-offer', 'the third releases the step');
      assert.deepEqual((await t.kinds('limit')).map((entry) => [entry['which'], entry['step']]), [['missing-produces', 'change']]);
      assert.match(gapsOf(await t.ledger()).join('\n'), /The required result was not produced during the change after 3 tries/);
    });
  });
});

describe('task route: text the model has no use for is not sent', { concurrency: 4 }, () => {
  it('an empty map is recorded but not delivered; a map with candidates still is', async () => {
    await withTask(async (t) => {
      await t.fx.repo.write('docs/empty-plan.md', '# Plan\n\n## Iteration 1\ntidy the wording.\n');
      await t.start({ plan: 'docs/empty-plan.md' });
      assert.equal(Number((await t.kinds('map')).at(-1)?.['candidates']), 0);
      assert.doesNotMatch(await t.work(), /## map/);
    });
    await withTask(async (t) => {
      await t.fx.repo.write('src/seeded/reducer.ts', 'export function reduceTotals(): number {\n  return 1;\n}\n');
      await t.fx.repo.commitAll('seeded file');
      await t.fx.repo.write('docs/plan.md', '# Plan\n\n## Iteration 1\nChange `reduceTotals` in src/seeded/reducer.ts:1.\n');
      await t.start({ plan: 'docs/plan.md' });
      assert.match(await t.work(), /## map\nMap: files ranked[\s\S]*src\/seeded\/reducer\.ts/);
    });
  });

  it('the change step does not tell the model to say the baseline stays out of review', async () => {
    await withTask(async (t) => {
      await t.start();
      assert.doesNotMatch(await t.work(), /\(the baseline\) stay out/);
    });
  });
});

describe('task route: format is a code step', { concurrency: 4 }, () => {
  it('the green check that ends change runs the format command on the touched files and lands on the offer; change.md no longer mentions format', async () => {
    await withTask(async (t) => {
      const offer = await toOffer(t);
      assert.equal(offer.position, 'review-offer');
      const [entry, ...more] = await t.kinds('format');
      assert.deepEqual([entry?.['key'], entry?.['outcome'], entry?.['exit'], more.length], ['app/format', 'formatted', 0, 0]);
      assert.doesNotMatch(await readFile(path.join(REPO_ROOT, 'routes', 'task', 'change.md'), 'utf8'), /format/);
    }, { config: CHECK_CONFIG.replace('fmt {file}', 'true {file}') });
  });

  const PROPOSE = COMMAND_PACK.replace('{ command: format, action: run', '{ command: format, action: propose');

  it('a format command that needs approval asks the user before the review offer; approving runs it and records formatted', async () => {
    await withTask(async (t) => {
      const asked = await toOffer(t);
      assert.equal(asked.position, 'format');
      assert.deepEqual((await prints(t)).map((entry) => entry['gate']), ['check-only-unauthorized']);
      assert.deepEqual((await t.kinds('format')), []);
      const offer = await t.hook('check-only-unauthorized', 'approve');
      assert.equal(offer.position, 'review-offer');
      assert.deepEqual((await t.kinds('format')).map((entry) => [entry['key'], entry['outcome']]), [['app/format', 'formatted']]);
    }, { pack: PROPOSE, config: CHECK_CONFIG.replace('fmt {file}', 'true {file}') });
  });

  it('declining the format question records refused, and the report says not formatted (refused)', async () => {
    await withTask(async (t) => {
      assert.equal((await toOffer(t)).position, 'format');
      assert.equal((await t.hook('check-only-unauthorized', 'decline')).position, 'review-offer');
      assert.deepEqual((await t.kinds('format')).map((entry) => entry['outcome']), ['refused']);
      assert.match((await t.hook('review-offer', 'skip — verification incomplete')).text, /not formatted: app\/format \(refused\)/);
    }, { pack: PROPOSE });
  });

  it('headless, nobody can answer: the format step is recorded refused and no gate waits on it', async () => {
    await withTask(async (t) => {
      assert.equal((await toOffer(t, { headless: true })).position, 'write');
      assert.deepEqual((await t.kinds('format')).map((entry) => entry['outcome']), ['refused']);
    }, { pack: PROPOSE });
  });
});

describe('gate hook from a process folder other than the repository root', { concurrency: 4 }, () => {
  it('the AskUserQuestion answer arrives through a hook process outside the repository: the gate advances to review-agent', async () => {
    await withTask(async (t) => {
      await toOffer(t);
      const print = (await t.kinds('gate')).findLast((entry) => entry['gate'] === 'review-offer')!;
      const wrapper = await mkdtemp(path.join(tmpdir(), 'ambicode-above-'));
      try {
        const above = await createRuntime({ ...t.fx.runtime, cwd: wrapper });
        const question = `Run the review? [ambicode gate review-offer ${print.id}]`;
        const event = { hook_event_name: 'PostToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question, options: [{ label: 'run' }, { label: 'skip — verification incomplete' }] }] }, tool_response: { answers: { [question]: 'run' } } };
        const output = (await runHook(above, JSON.stringify({ session_id: SESSION_A, cwd: path.join(t.fx.repo.root, 'src'), scratchpad_dir: t.fx.scratchpad, ...event }))) as { hookSpecificOutput?: { additionalContext: string } };
        assert.match(output.hookSpecificOutput?.additionalContext ?? '', /ambicode:reviewer/);
        assert.deepEqual((await t.kinds('step')).filter((entry) => entry['status'] === 'failed'), []);
      } finally {
        await rm(wrapper, { recursive: true, force: true });
      }
    });
  });
});

describe('step header (round-2 N9)', { concurrency: 4 }, () => {
  it('prints the Route line last, only when one is given', () => {
    const base = { skill: 'task', task: 't', step: 'change', position: 6, total: 12, now: 'n', then: 'x' };
    assert.equal(stepHeader(base).split('\n').length, 3);
    assert.equal(stepHeader({ ...base, route: 'ground (done) · change (now) · review-offer' }).split('\n')[3], 'Route: ground (done) · change (now) · review-offer');
  });

  it('07-R7: a review command in the Now line stays whole under a long task slug; long prose is still cut', async () => {
    const task = `ord-${'x'.repeat(150)}`;
    const now = `Run \`node "/a/very/long/plugin/cache/path/ambicode/0.3.1/scripts/ambicode.mjs" review record --task ${task}\``;
    const line = stepHeader({ skill: 'task', task, step: 'review-run', position: 9, total: 12, now, then: 'next' }).split('\n')[1]!;
    assert.equal(line, `Now: ${now}`);
    const prose = stepHeader({ skill: 'task', task, step: 'change', position: 6, total: 12, now: 'word '.repeat(60), then: 'next' }).split('\n')[1]!;
    assert.equal(prose.length, 'Now: '.length + 158);
    assert.ok(prose.endsWith('…'));
  });
});

describe('task route: the implementer invariants', { concurrency: 4 }, () => {
  const PROPOSE = COMMAND_PACK.replace('{ command: unit, action: run, reason: "unit" }', '{ command: unit, action: propose, reason: "unit" }');

  it('route next at a delegated step re-delivers the launch only, and the work file keeps the brief and the runnable checks', async () => {
    await withTask(async (t) => {
      await t.start();
      const again = await t.next({ cause: 'route-next' });
      assert.match(again.text, /Not done yet: check\{green\} is not on record/);
      assert.match(again.text, /Implement the work described in .+work-change\.md\./);
      assert.doesNotMatch(again.text, /## (checks\.runnable|brief)/);
      assert.match(await t.work(), /## brief\n[\s\S]*## checks\.runnable/);
    });
  });

  it('bug 1: an approval during fix keeps the findings in the work file', async () => {
    await withTask(async (t) => {
      await t.start();
      await t.edit();
      await t.check('green', null);
      await t.hook('review-offer', 'run');
      assert.equal((await t.review([finding({ id: 'F1' })])).position, 'fix');
      assert.equal((await t.runCheck({ phase: 'green' })).outcome, 'waiting');
      await t.hook('check-only-unauthorized', 'approve');
      assert.match(await t.work('fix'), /F1 src\/orders\.ts:2/);
    }, { pack: PROPOSE });
  });

  it('bug 1: after a second review round with a code revise the work file still names the latest findings', async () => {
    await withTask(async (t) => {
      await t.start();
      await t.edit();
      await t.check('green', null);
      await t.hook('review-offer', 'run');
      await t.review([finding({ id: 'F1' })]);
      await t.held('green');
      await t.next();
      await t.hook('review-again', 'run');
      await t.review([finding({ id: 'F2' })]);
      const work = await t.work('fix');
      assert.match(work, /F2 /);
      assert.doesNotMatch(work, /F1 /, 'the earlier round is not the latest findings');
    });
  });

  it('bug 2/I4: fix carries the brief, the request, the envelope and the before-work policy that change carries, and the runnable checks', async () => {
    await withTask(async (t) => {
      await t.start();
      const change = await t.work();
      await t.edit();
      await t.check('green', null);
      await t.hook('review-offer', 'run');
      await t.review([finding({ id: 'F1' })]);
      const fix = await t.work('fix');
      for (const key of ['brief', 'request', 'envelope', 'policy:before-work']) assert.equal(fix.includes(`## ${key}\n`), change.includes(`## ${key}\n`), `fix and change agree on ## ${key}`);
      assert.match(fix, /## brief\n/);
      assert.match(fix, /## request\nfix `total` for an empty list/);
      assert.match(fix, /## checks\.runnable\n/);
      assert.notEqual(section(change, 'policy:before-work'), '', 'the rules fixture staged a policy, so the equality is not between two empties');
      assert.equal(section(fix, 'policy:before-work'), section(change, 'policy:before-work'));
    }, WITH_RULES);
  });

  it('risk 1: the reviewer brief stages its own rules; the fix work file still carries the task rules change carried, not the review ones', async () => {
    await withTask(async (t) => {
      const def = t.fx.routes.route('task')!;
      assert.deepEqual(def.steps.find((step) => step.id === 'fix')!.payload, ['brief', 'envelope', 'policy:before-work', 'checks.runnable']);
      await t.start();
      const change = ruleIds(section(await t.work(), 'policy:before-work'));
      assert.ok(change.includes('common-code/callers') && change.includes('common-design/reuse-before-reimplementing'), change.join(' '));
      await t.edit();
      await t.check('green', null);
      await t.hook('review-offer', 'run');
      await t.review([finding({ id: 'F1' })]);
      const fix = ruleIds(section(await t.work('fix'), 'policy:before-work'));
      assert.deepEqual(fix, change, 'fix carries the rules change carried');
      assert.ok(!fix.includes('common-security/no-secret-exposure'), 'a review-only rule is not a coding rule');
    }, WITH_RULES);
  });

  it('the reviewer brief delivers the rules of the reviewed files only: a touched file the review excludes brings none, and the ids a finding may cite are the delivered ones', async () => {
    const pack = (applies: string, id: string): string => ['schemaVersion: 1', `id: ${id}`, 'authority: team', `appliesTo: ["${applies}"]`, 'activities: [review]', 'source: { location: "test" }', 'rules:', '  - id: freeze', '    category: security', '    instruction: Freeze this file.', '    check: { kind: reviewer, explanation: x }', ''].join('\n');
    const config = CHECK_CONFIG.replace('    policyFiles: [.ambicode/policies/cmds.yaml]', '    policyFiles: [.ambicode/policies/cmds.yaml, .ambicode/policies/gen.yaml, .ambicode/policies/src.yaml]').replace('excludePaths: []', "excludePaths: ['gen/**']");
    await withTask(async (t) => {
      await t.fx.repo.write('.ambicode/policies/gen.yaml', pack('gen/**', 'gen'));
      await t.fx.repo.write('.ambicode/policies/src.yaml', pack('src/**', 'srcpack'));
      await t.start();
      await t.edit();
      await t.fx.repo.write('gen/out.ts', 'export const generated = 1;\n');
      await t.check('green', null);
      await t.hook('review-offer', 'run');
      const bundle = path.dirname(path.join(t.fx.repo.root, String((await t.kinds('review'))[0]!['result'])));
      const brief = await readFile(path.join(bundle, 'brief.md'), 'utf8');
      const result = JSON.parse(await readFile(path.join(bundle, 'result.json'), 'utf8')) as { changedFiles: { newPath: string; exclusionReason: string | null }[] };
      assert.deepEqual(result.changedFiles.filter((file) => file.exclusionReason === null).map((file) => file.newPath), ['src/orders.ts'], 'the review excludes gen/');
      const staged = (await t.kinds('policy')).findLast((entry) => entry['activity'] === 'review')!['ids'] as string[];
      assert.deepEqual(staged, ['srcpack/freeze']);
      assert.ok(brief.includes('srcpack/freeze') && !brief.includes('gen/freeze'), 'the brief carries the rules of the reviewed files only');
    }, { config });
  });

  it('risk 7/I4: the request has its own section in the work file, whole, with or without a plan', async () => {
    await withTask(async (t) => {
      const long = `fix \`total\` for an empty list. ${'Details that matter. '.repeat(400)}END`;
      await t.start({ text: long });
      const work = await t.work();
      assert.ok(section(work, 'request').trimEnd().endsWith('END'), 'the whole request is in the file');
      assert.doesNotMatch(section(work, 'brief'), /Details that matter/);
    });
    await withTask(async (t) => {
      await t.fx.repo.write('.ambicode/tasks/ord-7/plan.md', '# Plan\n\n## Iteration 1\nAdd the guard.\n\n## Iteration 2\nSeed the reduce.\n');
      await t.start({ plan: '.ambicode/tasks/ord-7/plan.md' });
      const work = await t.work();
      assert.match(work, /## request\nfix `total` for an empty list[\s\S]*## brief\nTask ord-7 · iteration 1 of 2[^\n]*\n\n## Iteration 1\nAdd the guard\./);
      assert.doesNotMatch(work, /Seed the reduce/);
    });
  });

  it('windows: the repository line is the platform-quoted command', async () => {
    await withTask(async (t) => {
      await t.start();
      const quoted = /Run commands from the repository: `cd (.+)`\.\n/.exec(await t.work())?.[1] ?? '';
      const at = quoted.slice(1, -1);
      assert.equal(quoted, shellQuote(at), 'quoted by the check runner\'s own helper');
      assert.ok(path.isAbsolute(at) && (await realpath(at)) === (await realpath(t.fx.repo.root)), at);
    });
  });
});

describe('task route: the implementer hold, second review', { concurrency: 4 }, () => {
  const atFix = async (t: Fixture): Promise<void> => {
    await t.start();
    await t.edit();
    await t.check('green', null);
    await t.hook('review-offer', 'run');
    await t.review([finding({ id: 'F1' })]);
  };
  const check = (t: Fixture) => runCheckCommand(t.fx.runtime, parseArgs('check', ['--task', 'ord-7', '--name', 'unit', '--file', 'src/a.spec.ts', '--phase', 'green'], CHECK_OPTIONS));
  const chainOf = async (t: Fixture) => buildChain(await t.ledger(), (await t.ledger()).find((entry) => entry.kind === 'route')!);

  it('item 3: a check is held at a delegated step, even after its green, and no longer once the route asked its own next question', async () => {
    await withTask(async (t) => {
      await atFix(t);
      await t.held('green');
      assert.equal((await check(t)).next, undefined, 'the subagent is still in flight at fix');
      await t.next({ cause: 'route-next' });
      assert.equal((await t.kinds('gate')).at(-1)?.['gate'], 'review-again');
      assert.notEqual((await check(t)).next, undefined, 'at review-again the main session is in charge: the check advances the route');
    });
  });

  it('item 3 (c): another route chain stepping in the same task ledger does not release the hold, and route next still advances this one', async () => {
    await withTask(async (t) => {
      await t.start();
      await t.edit();
      await t.held('green');
      await t.append({ kind: 'step', route: 'another-route', step: 'format', actor: 'code', status: 'completed', cause: 'check' });
      assert.equal(delegatedStepOf(t.fx.routes.route('task')!, await chainOf(t))?.id, 'change');
      assert.equal((await check(t)).next, undefined, 'held by this chain\'s position, not by the ledger\'s last line');
      assert.match((await t.next()).text, /\[ambicode gate review-offer /);
    });
  });

  it('item 3 (a): the held check ends with one neutral line and no route text', async () => {
    await withTask(async (t) => {
      await t.start();
      const out = await check(t);
      assert.equal(out.next, undefined);
      const text = renderCheck(out);
      assert.ok(text.endsWith('\n\nRecorded; the main session advances the route.'), text);
      assert.doesNotMatch(text, /route next|Then:|Route:|\[ambicode/);
    });
  });

  it('nit: an approval revise into change keeps no findings an earlier revise aimed at fix left', async () => {
    await withTask(async (t) => {
      await t.start();
      await t.append({ kind: 'revise', from: 'fix', via: 'code', cycle: 1, reason: 'review-findings', args: { findings: ['F9 old finding'] } });
      await t.append({ kind: 'revise', from: 'change', via: 'gate', cycle: 1, reason: 'approved' });
      await t.next({ cause: 'route-next' });
      assert.doesNotMatch(await t.work(), /F9 old finding/);
    });
  });
});
