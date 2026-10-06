import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { launchRoute } from '#hook/events/prompt-launch';
import { STAGE_LIMITS } from '#modules/policy/stage';
import { stepHeader } from '#harness/engine/delivery';
import { MAX_INSTRUCTION_CHARS } from '#harness/definition/routes';
import { COMMAND_PACK, CHECK_TASK } from '#testing/fixtures/check-fixture';
import { finding } from '#testing/fixtures/review-fixture';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { appendLedger } from '#modules/evidence/ledger/ledger';
import { REPO_ROOT } from '#testing/paths';
import { SESSION_A } from '#testing/fixtures/ids';

type Fixture = Awaited<ReturnType<typeof taskFixture>>;

const OTHER = { oldPath: 'src/other.ts', newPath: 'src/other.ts', side: 'new' as const, line: 1 };

async function withTask(body: (t: Fixture) => Promise<void>, options: Parameters<typeof taskFixture>[0] = {}): Promise<void> {
  const t = await taskFixture(options);
  try {
    await body(t);
  } finally {
    await t.fx.dispose();
  }
}

/** red → green → format, landing on the review offer. */
async function toOffer(t: Fixture, start: Parameters<Fixture['start']>[0] = {}) {
  await t.start(start);
  await t.check('red', { ran: 1, failed: 1 });
  await t.edit();
  await t.check('green', { ran: 1, failed: 0 });
  return t.format();
}

const section = (text: string, name: string): string => text.split(`## ${name}\n`)[1]?.split('\n\n## ')[0] ?? '';
const delivered = async (t: Fixture, step: string): Promise<number> => (await t.kinds('step')).filter((entry) => entry['step'] === step && entry['status'] === 'delivered').length;
const prints = async (t: Fixture, gate?: string) => (await t.kinds('gate')).filter((entry) => gate === undefined || entry['gate'] === gate);

describe('task route (07-R, 07-V, 07-G)', () => {
  it('07-R1: the shipped route declares its steps in order, the draft-ok gate, the raised registry gates and 18 model steps', async () => {
    await withTask(async (t) => {
      const def = t.fx.routes.route('task')!;
      assert.deepEqual(def.steps.map((step) => step.id), ['template', 'fetch', 'start', 'draft-ok', 'ground', 'red', 'green', 'review-offer', 'review-run', 'fix', 'report-step', 'write']);
      assert.deepEqual(def.steps.find((step) => step.id === 'draft-ok')?.gate?.options, ['implement anyway', 'stop']);
      assert.ok(t.fx.routes.gate('check-only-unauthorized') !== null && t.fx.routes.gate('scope-expanding') !== null);
      assert.equal(def.budget.modelSteps, 18);
    });
  });

  it('07-R3: a draft plan meets draft-ok, whose default stop exits draft-stop', async () => {
    await withTask(async (t) => {
      await t.fx.repo.write('docs/plan-draft.md', '# Plan\n\nDo it.\n');
      assert.equal((await t.start({ plan: 'docs/plan-draft.md', headless: true })).position, 'complete');
      assert.equal((await t.kinds('default-taken')).find((entry) => entry['gate'] === 'draft-ok')?.['answer'], 'stop');
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'draft-stop');
      assert.equal((await t.kinds('baseline')).length, 0, 'nothing is grounded for a stopped draft');
    });
  });

  it('07-R3: --from-draft on the cli channel is a preanswer the draft-ok gate honours', async () => {
    await withTask(async (t) => {
      await t.fx.repo.write('docs/plan-draft.md', '# Plan\n\nDo it.\n');
      assert.equal((await t.start({ fromDraft: 'docs/plan-draft.md', channel: 'cli' })).position, 'red');
      assert.deepEqual((await t.kinds('preanswer')).map((entry) => [entry['gate'], entry['option']]), [['draft-ok', 'implement anyway']]);
      assert.equal((await t.kinds('acceptance')).find((entry) => entry['gate'] === 'draft-ok')?.['answer'], 'implement anyway');
    });
  });

  it('07-R2: the brief is the iteration after the latest notes iteration; past the last one the route exits iterations-complete', async () => {
    const plan = '.ambicode/task/ord-7/plan.md';
    const note = (t: Fixture, iteration: number) =>
      appendLedger(t.fx.runtime.fs, t.dir, t.fx.runtime.clock.now(), 'test-writer', { kind: 'note', note: 'notes', path: `notes-${iteration}.md`, contentHash: 'sha256:0', iteration });
    await withTask(async (t) => {
      await t.fx.repo.write(plan, '# Plan\n\n## Iteration 1\nAdd the guard.\n\n## Iteration 2\nSeed the reduce.\n');
      await note(t, 1);
      const red = await t.start({ plan });
      assert.match(red.text, /iteration 2 of 2 · plan: \.ambicode\/task\/ord-7\/plan\.md\n\n## Iteration 2\nSeed the reduce\./);
      assert.doesNotMatch(red.text, /Add the guard/);
      const record = (await t.kinds('step')).find((entry) => entry['step'] === 'start');
      assert.deepEqual([record?.['planPath'], record?.['iteration'], record?.['iterations']], [plan, 2, 2]);
    });
    await withTask(async (t) => {
      await t.fx.repo.write(plan, '# Plan\n\n## Iteration 1\nAdd the guard.\n');
      await note(t, 1);
      assert.equal((await t.start({ plan })).position, 'complete');
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'iterations-complete');
    });
  });

  it('07-R4/07-G1/07-G2: ground records baseline, map and both policy stages in order, lists callers with collides, states the grep fallback, under 9 KiB', async () => {
    await withTask(async (t) => {
      await t.fx.repo.write('src/other.ts', 'export function total(): number {\n  return 1;\n}\n');
      await t.fx.repo.commitAll('a second total');
      const red = await t.start();
      const order = (await t.ledger()).map((entry) => (entry.kind === 'policy' ? `policy:${entry['stage']}` : entry.kind === 'step' ? `step:${entry['step']}` : entry.kind));
      const at = (name: string): number => order.indexOf(name);
      assert.ok(at('baseline') < at('map') && at('map') < at('policy:before-work') && at('policy:before-work') < at('policy:before-checks') && at('policy:before-checks') < at('step:ground'), order.join(' '));
      const callers = section(red.text, 'callers');
      assert.match(callers, /a `collides` caller → verify its import before editing/);
      assert.match(callers, /^ {2}total — \d+ refs, collides$/m);
      assert.match(callers, /^index: none — grep fallback$/m);
      assert.ok(Buffer.byteLength(red.text) <= 9 * 1024, `${Buffer.byteLength(red.text)} bytes`);
    });
  });

  it('07-R6/D4: check{red} and check{green} match on phase, and an unproven green still completes green', async () => {
    await withTask(async (t) => {
      await t.start();
      assert.equal((await t.check('green', { ran: 1, failed: 0 })).position, 'red', 'a green check is no red evidence');
      assert.equal((await t.check('red', { ran: 1, failed: 1 })).position, 'green');
      await t.check('green', { ran: 0, failed: 0 });
      assert.equal((await t.format()).position, 'review-offer');
    });
  });

  it('07-R5/07-R9: three nexts with no red check record limit missing-produces at red, and the report says no-red', async () => {
    await withTask(async (t) => {
      await t.start();
      for (let index = 0; index < 3; index += 1) await t.next();
      assert.deepEqual((await t.kinds('limit')).map((entry) => [entry['which'], entry['step']]), [['missing-produces', 'red']]);
      await t.edit();
      await t.check('green', { ran: 1, failed: 0 });
      await t.format();
      const write = await t.hook('review-offer', 'skip — verification incomplete');
      assert.equal(write.position, 'write');
      assert.match(write.text, /no-red: no failing-first test recorded/);
    });
  });

  it('07-R7/07-V4: headless, the offer defaults to skip; review-run and fix are skipped, no review runs, and the report says so', async () => {
    await withTask(async (t) => {
      const write = await toOffer(t, { headless: true });
      assert.equal(write.position, 'write');
      assert.equal((await t.kinds('default-taken')).find((entry) => entry['gate'] === 'review-offer')?.['answer'], 'skip — verification incomplete');
      const skipped = (await t.kinds('step')).filter((entry) => entry['status'] === 'skipped').map((entry) => entry['step']);
      assert.ok(skipped.includes('review-run') && skipped.includes('fix'));
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

  it('07-R7: a trusted preanswer run is honoured at the gate, and review-run delivers the review command', async () => {
    await withTask(async (t) => {
      const run = await toOffer(t, { answers: [{ gate: 'review-offer', option: 'run' }] });
      assert.equal(run.position, 'review-run');
      assert.match(run.text, /Now: Run `[^`]*review --task ord-7`/);
      const preanswer = (await t.kinds('preanswer'))[0];
      assert.deepEqual((await t.kinds('acceptance')).map((entry) => [entry['gate'], entry['answer'], entry['via'], entry['preanswer']]), [['review-offer', 'run', 'prompt', preanswer?.id]]);
    });
  });

  it('07-V3: the first entry to fix comes from review-run, one more from report-step, and the third is refused with limit repeat', async () => {
    await withTask(async (t) => {
      await toOffer(t);
      await t.hook('review-offer', 'run');
      const fix = await t.review([finding({ id: 'F1' })]);
      assert.equal(fix.position, 'fix');
      assert.match(fix.text, /F1 src\/orders\.ts:2/);
      await t.check('green', { ran: 1, failed: 0 });
      assert.equal((await t.review([finding({ id: 'F2' })])).position, 'fix');
      await t.check('green', { ran: 1, failed: 0 });
      assert.equal((await t.review([finding({ id: 'F3' })])).position, 'write');
      assert.deepEqual((await t.kinds('revise')).map((entry) => entry['reason']), ['review-run: review-findings', 'report-step: review-findings']);
      assert.ok((await t.kinds('limit')).some((entry) => entry['which'] === 'repeat' && entry['step'] === 'fix'));
      assert.equal(await delivered(t, 'fix'), 2);
    });
  });

  it('07-V1/07-V3: an approved waiting key re-enters review-run, the review reruns, and a clean rerun goes on without fix', async () => {
    await withTask(async (t) => {
      await toOffer(t);
      await t.hook('review-offer', 'run');
      assert.equal((await t.review([], { waiting: ['app/e2e'] })).position, 'review-run');
      assert.deepEqual((await prints(t, 'check-only-unauthorized')).map((entry) => [entry['raisedBy'], entry['values']]), [['review-run', { key: ['app/e2e'], files: ['the change under review'] }]]);
      assert.match((await t.hook('check-only-unauthorized', 'approve')).text, /review --task ord-7/);
      assert.equal((await t.review([])).position, 'write');
      assert.equal(await delivered(t, 'fix'), 0);
    });
  });

  it('07-V1: each waiting key gets its own gate, the next one raised as soon as the first is approved', async () => {
    await withTask(async (t) => {
      await toOffer(t);
      await t.hook('review-offer', 'run');
      await t.review([], { waiting: ['app/e2e', 'app/unit'] });
      const second = await t.hook('check-only-unauthorized', 'approve');
      assert.match(second.text, /Run app\/unit on/);
      assert.deepEqual((await prints(t, 'check-only-unauthorized')).map((entry) => (entry['values'] as { key: string[] }).key), [['app/e2e'], ['app/unit']]);
      assert.match((await t.hook('check-only-unauthorized', 'approve')).text, /review --task ord-7/);
    });
  });

  it('07-V1: a fix-round review waiting on a key is raised at report-step and approved back into fix', async () => {
    await withTask(async (t) => {
      await toOffer(t);
      await t.hook('review-offer', 'run');
      await t.review([finding({ id: 'F1' })]);
      await t.check('green', { ran: 1, failed: 0 });
      assert.equal((await t.review([], { waiting: ['app/e2e'] })).position, 'report-step');
      assert.deepEqual((await prints(t, 'check-only-unauthorized')).map((entry) => [entry['raisedBy'], entry['openAt']]), [['fix', 'report-step']]);
      assert.equal((await t.hook('check-only-unauthorized', 'approve')).position, 'fix');
      await t.check('green', { ran: 1, failed: 0 });
      assert.equal((await t.review([])).position, 'write');
    });
  });

  it('07-V1: an out-of-scope finding asks scope-expanding; "out of scope" goes on without fix', async () => {
    await withTask(async (t) => {
      await toOffer(t);
      await t.hook('review-offer', 'run');
      await t.review([finding({ id: 'F1', location: OTHER })]);
      assert.match(String((await prints(t, 'scope-expanding'))[0]?.['question']), /F1 src\/other\.ts:1/);
      assert.equal((await t.hook('scope-expanding', 'out of scope')).position, 'write');
      assert.equal(await delivered(t, 'fix'), 0);
    });
  });

  it('07-V1: "include" on scope-expanding revises fix with the finding', async () => {
    await withTask(async (t) => {
      await toOffer(t);
      await t.hook('review-offer', 'run');
      await t.review([finding({ id: 'F1', location: OTHER })]);
      const fix = await t.hook('scope-expanding', 'include');
      assert.equal(fix.position, 'fix');
      assert.match(fix.text, /F1 src\/other\.ts:1/);
    });
  });

  it('07-R2: --plan and --from-draft set the route args and change its hash; the slug comes from the plan\'s task directory', async () => {
    await withTask(async (t) => {
      await t.fx.repo.write('docs/plan.md', '# Plan\n');
      await t.start({ task: 'r-none' });
      await t.start({ task: 'r-plan', plan: 'docs/plan.md' });
      await t.start({ task: 'r-draft', fromDraft: 'docs/plan.md' });
      const args = async (task: string) => (await t.fx.kinds(task, 'route'))[0]?.['args'] as { plan: string | null; fromDraft: string | null; hash: string };
      const [none, plan, draft] = [await args('r-none'), await args('r-plan'), await args('r-draft')];
      assert.deepEqual([plan.plan, plan.fromDraft, draft.plan, draft.fromDraft], ['docs/plan.md', null, 'docs/plan.md', 'docs/plan.md']);
      assert.equal(new Set([none.hash, plan.hash, draft.hash]).size, 3);
      await t.fx.repo.write('.ambicode/task/ord-9/plan.md', '# Plan\n');
      await t.fx.engine.start({ skill: 'task', text: 'go', requirements: [], plan: '.ambicode/task/ord-9/plan.md', cwd: t.fx.repo.root, session: SESSION_A, channel: 'cli' });
      assert.equal((await t.fx.kinds('ord-9', 'route')).length, 1, 'the slug comes from the plan\'s task directory');
    });
  });

  it('07-R1: a UserPromptSubmit /ambicode:task with --plan starts the route at red, without prepare', async () => {
    await withTask(async (t) => {
      await t.fx.repo.write('docs/plan.md', '# Plan\n\nSeed the reduce.\n');
      const text = await launchRoute(t.fx.runtime, { hook_event_name: 'UserPromptSubmit', prompt: '/ambicode:task --task ord-7 --plan docs/plan.md fix total', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad } as never, { engine: t.fx.engine, routes: t.fx.routes, pointer: t.fx.pointer });
      assert.match(text ?? '', /step red/);
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
      assert.equal((await t.review([])).position, 'write');
      const asked = (await prints(t)).length;
      assert.ok(asked >= 1 && asked <= 3, `${asked}`);
    });
  });

  it('07-R8: ceremony — a red check under propose adds one question', async () => {
    await withTask(async (t) => {
      await t.start();
      await t.runCheck();
      assert.deepEqual((await prints(t)).map((entry) => entry['gate']), ['check-only-unauthorized']);
    }, { pack: COMMAND_PACK.replace('{ command: unit, action: run, reason: "unit" }', '{ command: unit, action: propose, reason: "unit" }') });
  });

  it('07-R8: every task step text is at most 1,500 characters after inclusion; start ≤ 4 KiB, report ≤ 3 KiB, before-checks ≤ 1.5 KiB', async () => {
    const cli = `node "${REPO_ROOT}/scripts/ambicode.mjs"`;
    for (const name of ['task-red', 'task-green', 'task-fix', 'task-write']) {
      const text = (await readFile(path.join(REPO_ROOT, 'routes', 'steps', `${name}.md`), 'utf8')).replaceAll('{cli}', cli).replaceAll('{task}', CHECK_TASK);
      assert.ok(text.length <= MAX_INSTRUCTION_CHARS, `${name}: ${text.length}`);
    }
    assert.equal(STAGE_LIMITS['before-checks'], 1536);
    await withTask(async (t) => {
      await t.fx.repo.write('docs/plan.md', `# Plan\n\n${'Seed the reduce with zero. '.repeat(400)}\n`);
      const red = await t.start({ plan: 'docs/plan.md' });
      const brief = section(red.text, 'brief');
      assert.ok(Buffer.byteLength(brief) <= 4096, `${Buffer.byteLength(brief)}`);
      assert.match(brief, /\[cut: read docs\/plan\.md\]$/);
      assert.ok((await t.kinds('policy')).every((entry) => entry['stage'] !== 'before-checks' || Number(entry['bytes']) <= 1536));
      await t.check('red', { ran: 1, failed: 1 });
      await t.edit();
      await t.check('green', { ran: 1, failed: 0 });
      await t.format('unconfigured');
      const write = await t.hook('review-offer', 'skip — verification incomplete');
      assert.ok(Buffer.byteLength(section(write.text, 'report')) <= 3072);
      assert.match(section(write.text, 'report'), /<!-- ambicode report sha256:/);
    });
  });
});

describe('step header (round-2 N9)', () => {
  it('07-R7: a review command in the Now line stays whole under a long task slug; long prose is still cut', async () => {
    const task = `ord-${'x'.repeat(150)}`;
    const now = `Run \`node "/a/very/long/plugin/cache/path/ambicode/0.3.1/scripts/ambicode.mjs" review --task ${task}\``;
    const line = stepHeader({ skill: 'task', task, step: 'review-run', position: 9, total: 12, now, then: 'next' }).split('\n')[1]!;
    assert.equal(line, `Now: ${now}`);
    const prose = stepHeader({ skill: 'task', task, step: 'red', position: 6, total: 12, now: 'word '.repeat(60), then: 'next' }).split('\n')[1]!;
    assert.equal(prose.length, 'Now: '.length + 158);
    assert.ok(prose.endsWith('…'));
  });
});
