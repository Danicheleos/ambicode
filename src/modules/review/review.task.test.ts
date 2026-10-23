import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from '#util/args';
import { runReview, REVIEW_OPTIONS } from '#cli/commands/review/review';
import { COMMAND_PACK } from '#testing/fixtures/check-fixture';
import { pinReview } from '#modules/review/bundle/bundle';
import { CHECK_TASK } from '#testing/fixtures/check-fixture';
import { taskFixture } from '#testing/fixtures/task-fixture';

type Fixture = Awaited<ReturnType<typeof taskFixture>>;

const LINT_RUNS = COMMAND_PACK.replace('{ command: lint, action: forbid, reason: "never here" }', '{ command: lint, action: run, reason: "lint" }');

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
  await t.edit();
  await t.check('green', { ran: 1, failed: 0 });
  if (answer !== null) await t.hook('review-offer', answer);
}

/** The review the route pinned itself, as the model's brief and the report read it. */
const pinned = async (t: Fixture): Promise<{ omissions: { text: string }[]; changedFiles: { newPath?: string; oldPath?: string }[] }> =>
  JSON.parse(await readFile(path.join(t.fx.repo.root, String((await t.kinds('review')).at(-1)!['result'])), 'utf8'));

describe('review baseline scope (07-B): the task route pin, and the plain command', () => {
  it('07-B3: pre-existing changes are listed in one omission and leave the change', async () => {
    await withTask(async (t) => {
      await toRun(t, () => t.fx.repo.write('src/pre.ts', 'export const pre = 1;\n'));
      const out = await pinned(t);
      assert.ok(out.omissions.some((omission) => omission.text === 'not covered: pre-existing changes: src/pre.ts'), JSON.stringify(out.omissions));
      assert.ok(out.changedFiles.some((file) => file.newPath === 'src/orders.ts'));
      assert.ok(!out.changedFiles.some((file) => file.newPath === 'src/pre.ts' || file.oldPath === 'src/pre.ts'));
    });
  });

  it('07-B3: more than 10 pre-existing paths are listed first 10, then (+N more)', async () => {
    await withTask(async (t) => {
      await toRun(t, async () => { for (let i = 0; i < 12; i += 1) await t.fx.repo.write(`src/p${String(i).padStart(2, '0')}.ts`, 'x\n'); });
      const line = (await pinned(t)).omissions.find((entry) => entry.text.startsWith('not covered: pre-existing changes:'))?.text ?? '';
      assert.match(line, /p09\.ts/);
      assert.doesNotMatch(line, /p10\.ts/);
      assert.match(line, /\(\+2 more\)/);
    });
  });

  it('07-B3: a moved HEAD adds "HEAD moved since the task baseline"', async () => {
    await withTask(async (t) => {
      await toRun(t, async () => {}, null);
      await t.fx.repo.write('docs/note.md', 'moved\n');
      await t.fx.repo.commitAll('moved head');
      await t.fx.repo.write('src/orders.ts', 'export const later = 1;\n');
      await t.hook('review-offer', 'run');
      assert.ok((await pinned(t)).omissions.some((omission) => omission.text === 'HEAD moved since the task baseline'));
    });
  });

  it('07-B3: with an unmoved HEAD and no pre-existing changes there is no baseline omission', async () => {
    await withTask(async (t) => {
      await toRun(t);
      const omissions = (await pinned(t)).omissions.map((omission) => omission.text).join('\n');
      assert.doesNotMatch(omissions, /HEAD moved|not covered: pre-existing|no task baseline/);
    });
  });

  it('07-B3: the plain command carries no baseline omission', async () => {
    await withTask(async (t) => {
      await t.fx.repo.write('src/orders.ts', 'export const changed = 1;\n');
      const out = await runReview(t.runtime, parseArgs('review', [], REVIEW_OPTIONS));
      assert.doesNotMatch(out.result.omissions.map((omission) => omission.text).join('\n'), /baseline|pre-existing/);
    });
  });
});

describe('review bundles live inside the task', () => {
  it('two reviews of one task keep two bundles, 1/ and 2/, and the ledger names each', async () => {
    await withTask(async (t) => {
      await t.start();
      await t.edit();
      const pin = (): Promise<unknown> => pinReview(t.runtime, { assemble: { target: { kind: 'working' }, task: CHECK_TASK, requirements: [] }, omissions: [], ledger: {} });
      await pin();
      await pin();
      const base = path.join(t.fx.repo.root, '.ambicode', 'tasks', CHECK_TASK, 'reviews');
      for (const n of ['1', '2']) assert.ok((await readFile(path.join(base, n, 'result.json'), 'utf8')).length > 0, `${n}/result.json`);
      assert.deepEqual((await t.kinds('review')).map((entry) => entry['result']), ['1', '2'].map((n) => path.join('.ambicode', 'tasks', CHECK_TASK, 'reviews', n, 'result.json')));
      await assert.rejects(readFile(path.join(t.fx.repo.root, '.ambicode', 'reviews', CHECK_TASK, 'result.json')));
    });
  });
});
