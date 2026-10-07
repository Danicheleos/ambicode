import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRuntime } from '#composition/root';
import { parseArgs } from '#util/args';
import { runReview, REVIEW_OPTIONS } from '#cli/commands/review/review';
import { runRouteStart } from '#cli/commands/route/route';
import { CHECK_CONFIG, COMMAND_PACK, CHECK_TASK } from '#testing/fixtures/check-fixture';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { readLedger } from '#platform/ledger/ledger';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { ROUTE_START_OPTIONS } from '#types/cli';

type Fixture = Awaited<ReturnType<typeof taskFixture>>;

const reviewer = { async invoke() { return { kind: 'ok', output: { findings: [], coverageNotes: [] }, rawLength: 2, argv: ['claude'] } as never; } };
const LINT_RUNS = COMMAND_PACK.replace('{ command: lint, action: forbid, reason: "never here" }', '{ command: lint, action: run, reason: "lint" }');
const LINT_PROPOSED = COMMAND_PACK.replace('{ command: lint, action: forbid, reason: "never here" }', '{ command: lint, action: propose, reason: "ask" }');
const args = (...extra: string[]) => parseArgs('review', ['--task', CHECK_TASK, ...extra], REVIEW_OPTIONS);

async function withTask(body: (t: Fixture) => Promise<void>, pack = LINT_RUNS): Promise<void> {
  const t = await taskFixture({ pack });
  try {
    await body(t);
  } finally {
    await t.fx.dispose();
  }
}

/** Starts the route (ground records the baseline), after `before` has dirtied the tree. */
async function toRun(t: Fixture, before: () => Promise<void> = async () => {}, answer: string | null = 'run'): Promise<void> {
  await before();
  await t.start();
  await t.check('red', { ran: 1, failed: 1 });
  await t.edit();
  await t.check('green', { ran: 1, failed: 0 });
  await t.format();
  if (answer !== null) await t.hook('review-offer', answer);
}

const review = (t: Fixture, ...extra: string[]) => runReview(t.runtime, args(...extra), { reviewer: reviewer as never, warm: async () => {} });
const lint = (out: Awaited<ReturnType<typeof review>>) => out.result.checks.find((check) => check.commandId === 'lint');
const code = async (p: Promise<unknown>): Promise<string | null> => p.then(() => null, (error: { code?: string }) => error.code ?? 'other');

describe('review --task (07-B, 07-K5)', () => {
  it('07-B3: pre-existing changes are listed in one omission and checks skip them', async () => {
    await withTask(async (t) => {
      await toRun(t, () => t.fx.repo.write('src/pre.ts', 'export const pre = 1;\n'));
      const out = await review(t);
      assert.ok(out.result.omissions.includes('not covered: pre-existing changes: src/pre.ts'), out.result.omissions.join('|'));
      const selected = lint(out)?.selected.map((file) => file.path) ?? [];
      assert.ok(selected.includes('src/orders.ts'));
      assert.ok(!selected.includes('src/pre.ts'));
      assert.ok(!out.result.changedFiles.some((file) => file.newPath === 'src/pre.ts' || file.oldPath === 'src/pre.ts'));
    });
  });

  it('07-B3: more than 10 pre-existing paths are listed first 10, then (+N more)', async () => {
    await withTask(async (t) => {
      await toRun(t, async () => { for (let i = 0; i < 12; i += 1) await t.fx.repo.write(`src/p${String(i).padStart(2, '0')}.ts`, 'x\n'); });
      const line = (await review(t)).result.omissions.find((entry) => entry.startsWith('not covered: pre-existing changes:')) ?? '';
      assert.match(line, /p09\.ts/);
      assert.doesNotMatch(line, /p10\.ts/);
      assert.match(line, /\(\+2 more\)/);
    });
  });

  it('07-B3: a moved HEAD adds "HEAD moved since the task baseline"', async () => {
    await withTask(async (t) => {
      await toRun(t);
      await t.fx.repo.write('docs/note.md', 'moved\n');
      await t.fx.repo.commitAll('moved head');
      await t.fx.repo.write('src/orders.ts', 'export const later = 1;\n');
      assert.ok((await review(t)).result.omissions.includes('HEAD moved since the task baseline'));
    });
  });

  it('07-B3: with an unmoved HEAD and no pre-existing changes there is no baseline omission', async () => {
    await withTask(async (t) => {
      await toRun(t);
      const omissions = (await review(t)).result.omissions.join('\n');
      assert.doesNotMatch(omissions, /HEAD moved|not covered: pre-existing|no task baseline/);
    });
  });

  it('07-B4: a task route with no baseline entry refuses baseline-missing before any work', async () => {
    await withTask(async (t) => {
      await toRun(t);
      const file = path.join(t.dir, 'ledger.jsonl');
      const kept = (await readFile(file, 'utf8')).split('\n').filter((line) => line !== '' && JSON.parse(line).kind !== 'baseline');
      await writeFile(file, `${kept.join('\n')}\n`);
      const before = (await t.ledger()).length;
      assert.equal(await code(review(t)), 'baseline-missing');
      assert.equal((await t.ledger()).length, before);
    });
  });

  it('07-B4: with an open investigate route on the slug there is no refusal, no baseline omission and no scoping', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('package.json', '{}\n');
      await repo.write('.ambicode/config.yaml', CHECK_CONFIG);
      await repo.write('.ambicode/policies/cmds.yaml', COMMAND_PACK);
      await repo.write('src/a.ts', 'export const a = 1;\n');
      await repo.commitAll('initial');
      const runtime = await createRuntime({ cwd: repo.root });
      await runRouteStart(runtime, parseArgs('route start', ['investigate', '--task', CHECK_TASK, 'how does a work'], ROUTE_START_OPTIONS));
      await repo.write('src/a.ts', 'export const a = 2;\n');
      const out = await runReview(runtime, args(), { reviewer: reviewer as never, warm: async () => {} });
      assert.doesNotMatch(out.result.omissions.join('\n'), /baseline|pre-existing/);
      assert.ok(out.result.changedFiles.some((file) => file.newPath === 'src/a.ts'));
      const entries = await readLedger(nodeFileSystem, path.join(repo.root, '.ambicode', 'task', CHECK_TASK));
      assert.equal(entries.filter((entry) => entry.kind === 'review').at(-1)?.['preexisting'] === undefined, true);
    } finally {
      await repo.dispose();
    }
  });

  it('07-B4: standalone --task with no baseline reviews as today plus the no-baseline omission', async () => {
    await withTask(async (t) => {
      await t.fx.repo.write('src/orders.ts', 'export const changed = 1;\n');
      const out = await review(t);
      assert.ok(out.result.omissions.includes('no task baseline: pre-existing changes included'));
      assert.ok(out.result.changedFiles.some((file) => file.newPath === 'src/orders.ts'));
    });
  });

  it('07-B3: without --task the review is unchanged and carries no baseline omission', async () => {
    await withTask(async (t) => {
      await t.fx.repo.write('src/orders.ts', 'export const changed = 1;\n');
      const out = await runReview(t.runtime, parseArgs('review', [], REVIEW_OPTIONS), { reviewer: reviewer as never });
      assert.doesNotMatch(out.result.omissions.join('\n'), /baseline|pre-existing/);
      assert.equal(out.next, undefined);
    });
  });

  it('07-B5: a task route whose review-offer has no answer refuses review-not-accepted and writes no review', async () => {
    await withTask(async (t) => {
      await toRun(t, async () => {}, null);
      const before = (await t.ledger()).length;
      assert.equal(await code(review(t)), 'review-not-accepted');
      assert.equal((await t.ledger()).length, before);
    });
  });

  it('07-B5: a skip answer to review-offer also refuses review-not-accepted', async () => {
    await withTask(async (t) => {
      await toRun(t, async () => {}, 'skip — verification incomplete');
      assert.equal(await code(review(t)), 'review-not-accepted');
    });
  });

  it('07-B5: an honoured run answer lets the review run and appends a review entry', async () => {
    await withTask(async (t) => {
      await toRun(t);
      await review(t);
      assert.equal((await t.kinds('review')).length, 1);
    });
  });

  it('07-K5: in a task route a model --approve on a waiting key records declined acting-needs-human and the key stays pending', async () => {
    await withTask(async (t) => {
      await toRun(t);
      const out = await review(t, '--approve', 'app/lint');
      const declined = (await t.kinds('declined')).filter((entry) => entry['key'] === 'app/lint');
      assert.deepEqual(declined.map((entry) => [entry['reason'], entry['gate']]), [['acting-needs-human', 'check-only-unauthorized']]);
      assert.deepEqual(out.pendingApprovals.map((approval) => approval.approvalKey), ['app/lint']);
      assert.equal(out.awaitingAuthorization, true);
    }, LINT_PROPOSED);
  });

  it('07-K5: in an investigate route a model --approve on a waiting key records declined acting-needs-human and the key stays pending', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('package.json', '{}\n');
      await repo.write('.ambicode/config.yaml', CHECK_CONFIG);
      await repo.write('.ambicode/policies/cmds.yaml', LINT_PROPOSED);
      await repo.write('src/a.ts', 'export const a = 1;\n');
      await repo.commitAll('initial');
      const runtime = await createRuntime({ cwd: repo.root });
      await runRouteStart(runtime, parseArgs('route start', ['investigate', '--task', CHECK_TASK, 'how does a work'], ROUTE_START_OPTIONS));
      await repo.write('src/a.ts', 'export const a = 2;\n');
      const out = await runReview(runtime, args('--approve', 'app/lint'), { reviewer: reviewer as never, warm: async () => {} });
      const entries = await readLedger(nodeFileSystem, path.join(repo.root, '.ambicode', 'task', CHECK_TASK));
      const declined = entries.filter((entry) => entry.kind === 'declined' && entry['key'] === 'app/lint');
      assert.deepEqual(declined.map((entry) => entry['reason']), ['acting-needs-human']);
      assert.deepEqual(out.pendingApprovals.map((approval) => approval.approvalKey), ['app/lint']);
    } finally {
      await repo.dispose();
    }
  });
});
