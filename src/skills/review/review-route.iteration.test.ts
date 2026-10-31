import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { taskFixture, ORDERS } from '#testing/fixtures/task-fixture';
import { COMMAND_PACK, CHECK_TASK } from '#testing/fixtures/check-fixture';
import { appendLedger } from '#platform/ledger/ledger';
import { fileOf } from '#modules/requirements/capture/capture';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { contentHash } from '#util/hash';

type Fixture = Awaited<ReturnType<typeof taskFixture>>;
const LINT_RUNS = COMMAND_PACK.replace('{ command: lint, action: forbid, reason: "never here" }', '{ command: lint, action: run, reason: "lint" }');
const EARLIER = ORDERS.replace('a + b)', 'a + b, 0)');

async function withTask(body: (t: Fixture) => Promise<void>): Promise<void> {
  const t = await taskFixture({ pack: LINT_RUNS });
  try {
    await body(t);
  } finally {
    await t.fx.dispose();
  }
}

/** A file of the latest pinned review's folder: the patch and the brief the reviewer reads. */
async function pinnedFile(t: Fixture, name: string): Promise<string> {
  const result = String((await t.kinds('review')).at(-1)!['result']);
  return readFile(path.join(t.fx.repo.root, path.dirname(result), name), 'utf8');
}

async function toReview(t: Fixture, edit: () => Promise<void>): Promise<void> {
  await t.start();
  await edit();
  await t.check('green', { ran: 1, failed: 0 });
  await t.hook('review-offer', 'run');
}

describe('the task review covers this iteration, not the whole tree (A1)', () => {
  it('a change an earlier iteration left uncommitted is not in the diff; this iteration\'s edit is', async () => {
    await withTask(async (t) => {
      await t.fx.repo.write('src/orders.ts', EARLIER);
      await toReview(t, () => t.fx.repo.write('src/orders.ts', `${EARLIER}export const added = 1;\n`));
      const patch = await pinnedFile(t, 'changed.diff');
      assert.match(patch, /\+export const added = 1;/);
      assert.doesNotMatch(patch, /^[+-].*a \+ b/m, patch);
    });
  });
});

describe('the task route reuses the requirements captured into the task (A2, A8)', () => {
  const KEY = 'ORD-7';
  const BODY = 'Totals of an empty cart are zero.';
  const PLAN = path.join('.ambicode', 'tasks', CHECK_TASK, 'plan.md');
  async function capture(t: Fixture): Promise<void> {
    const dir = await resolveTaskDir(t.fx.runtime, CHECK_TASK);
    const rawHash = contentHash(BODY);
    await t.fx.runtime.fs.mkdirp(dir.requirements);
    await t.fx.runtime.fs.writeText(fileOf(dir, KEY), JSON.stringify({ key: KEY, url: '', tool: 'mcp__x', retrievedAt: '2026-10-05T10:00:00.000Z', rawHash, content: BODY }));
    const append = (fields: Record<string, unknown> & { kind: string }) => appendLedger(t.fx.runtime.fs, t.dir, t.fx.runtime.clock.now(), fields);
    await append({ kind: 'requirement', route: 'investigate-1', key: KEY, via: 'mcp__x', rawHash, bytes: BODY.length, relation: 'asked', capture: 'full' });
    await t.fx.repo.write(PLAN, '---\nstatus: accepted\n---\n## Iteration 1: guard\nReturn zero for an empty list.\n\n## Iteration 2: other\nUnrelated step.\n');
    await append({ kind: 'note', route: 'plan-1', note: 'plan', path: PLAN, contentHash: 'sha256:x' });
  }

  it('the envelope is built from the task\'s captures, and the brief shows them and this iteration\'s plan section', async () => {
    await withTask(async (t) => {
      await capture(t);
      await toReview(t, () => t.edit());
      assert.equal((await t.kinds('envelope')).at(-1)!['builtFrom'], 'captures');
      const brief = await pinnedFile(t, 'brief.md');
      assert.doesNotMatch(brief, /none supplied/);
      assert.match(brief, new RegExp(BODY));
      assert.match(brief, /Return zero for an empty list/);
      assert.doesNotMatch(brief, /Unrelated step/);
    });
  });
});
