import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { planFixture } from '#testing/fixtures/plan-fixture';
import { appendLedger } from '#platform/ledger/ledger';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';

const PLAN = '.ambicode/tasks/ord-7/plan.md';
const NOTE = '.ambicode/tasks/ord-9/investigation_2026-10-01T10-00.md';
const NEWER = '.ambicode/tasks/ord-9/investigation_2026-10-02T10-00.md';

describe('the task map is seeded from the iteration brief', () => {
  it('a planned task started by its key alone maps the files its brief cites', async () => {
    const t = await taskFixture();
    try {
      await t.fx.repo.write(PLAN, '---\nstatus: accepted\n---\n# Plan\n\n## Iteration 1\nGuard `total` in `src/orders.ts`.\n');
      await appendLedger(t.fx.runtime.fs, t.dir, t.fx.runtime.clock.now(), { kind: 'note', note: 'plan', path: PLAN, contentHash: 'sha256:0' });
      await t.start({ text: 'ord-7' });
      const map = (await t.kinds('map')).at(-1);
      assert.ok(Number(map?.['candidates']) > 0, `candidates ${String(map?.['candidates'])}`);
    } finally {
      await t.fx.dispose();
    }
  });
});

const DRAFT = '---\nstatus: draft\n---\n# Plan\n\n## Iteration 1\nGuard `total` in `src/orders.ts`.\n';
const planNote = (t: Awaited<ReturnType<typeof taskFixture>>) => appendLedger(t.fx.runtime.fs, t.dir, t.fx.runtime.clock.now(), { kind: 'note', note: 'plan', path: PLAN, contentHash: 'sha256:0' });

describe('a plan the task finds that was not accepted is asked about once', () => {
  it('a draft plan.md with no accept on record raises plan-unaccepted; running on it accepts the file and the task goes on with its brief', async () => {
    const t = await taskFixture();
    try {
      await t.fx.repo.write(PLAN, DRAFT);
      const first = await t.start({ text: 'ord-7' });
      assert.match(first.text, /plan-unaccepted/);
      assert.equal((await t.kinds('map')).length, 0);
      await t.hook('plan-unaccepted', 'run on the draft');
      assert.match(await readFile(path.join(t.fx.repo.root, PLAN), 'utf8'), /^---\nstatus: accepted\n---/);
      assert.equal((await t.kinds('note')).filter((note) => note['note'] === 'plan').length, 1);
      assert.match(await t.work(), /## brief\n[\s\S]*Guard `total`/);
      assert.equal((await t.kinds('gate')).filter((print) => print['gate'] === 'plan-unaccepted').length, 1);
    } finally {
      await t.fx.dispose();
    }
  });

  it('a plan accepted and then taken back to draft is asked about the same way, and stop ends the route blocked with the plan named as not accepted', async () => {
    const t = await taskFixture();
    try {
      await t.fx.repo.write(PLAN, DRAFT);
      await planNote(t);
      const first = await t.start({ text: 'ord-7' });
      assert.match(first.text, /plan-unaccepted/);
      const stopped = await t.hook('plan-unaccepted', 'stop');
      assert.equal(stopped.position, 'complete');
      assert.match(stopped.text, /ended: blocked \(plan-unaccepted: stop\)/);
      const exit = (await t.kinds('exit')).at(-1)!;
      assert.equal(exit['reason'], 'blocked');
      assert.match(await readFile(path.join(t.fx.repo.root, PLAN), 'utf8'), /status: draft/);
      assert.equal((await t.kinds('map')).length, 0);
    } finally {
      await t.fx.dispose();
    }
  });

  it('a headless start takes the recommended answer, runs on the draft, and lists it as not verified', async () => {
    const t = await taskFixture();
    try {
      await t.fx.repo.write(PLAN, DRAFT);
      await t.start({ text: 'ord-7', headless: true });
      assert.match(await readFile(path.join(t.fx.repo.root, PLAN), 'utf8'), /status: accepted/);
      const taken = (await t.kinds('default-taken')).filter((entry) => entry['gate'] === 'plan-unaccepted');
      assert.deepEqual(taken.map((entry) => entry['answer']), ['run on the draft']);
      assert.match(await t.work(), /## brief\n[\s\S]*Guard `total`/);
    } finally {
      await t.fx.dispose();
    }
  });

  it('running on the draft records the plan note with no anchor count: no check ran, so none is claimed', async () => {
    const t = await taskFixture();
    try {
      await t.fx.repo.write(PLAN, DRAFT);
      await t.start({ text: 'ord-7' });
      await t.hook('plan-unaccepted', 'run on the draft');
      const note = (await t.kinds('note')).find((entry) => entry['note'] === 'plan')!;
      assert.equal('anchorsBad' in note, false);
    } finally {
      await t.fx.dispose();
    }
  });

  it('a plan.md with no frontmatter, or none with a status, was never accepted and raises the same question', async () => {
    for (const text of ['# Plan\n\n## Iteration 1\nGuard `total`.\n', '---\ntitle: x\n---\n# Plan\n\n## Iteration 1\nGuard `total`.\n']) {
      const t = await taskFixture();
      try {
        await t.fx.repo.write(PLAN, text);
        const first = await t.start({ text: 'ord-7' });
        assert.match(first.text, /plan-unaccepted/);
      } finally {
        await t.fx.dispose();
      }
    }
  });

  it('a plan that cannot be accepted when the answer is run on the draft fails the step instead of throwing', async () => {
    const t = await taskFixture();
    try {
      await t.fx.repo.write(PLAN, DRAFT);
      await t.start({ text: 'ord-7' });
      // The plan is read to see it is a draft, then again to accept it: it vanishes between the two.
      const fs = t.fx.runtime.fs;
      const read = fs.readText.bind(fs);
      let plans = 0;
      fs.readText = (file: string) => (file.endsWith('plan.md') && ++plans === 2 ? Promise.reject(new Error('gone')) : read(file));
      await assert.rejects(t.hook('plan-unaccepted', 'run on the draft'), { code: 'plan-draft-missing' });
      const failure = (await t.kinds('step')).findLast((entry) => entry['step'] === 'start' && entry['status'] === 'failed');
      assert.equal(failure?.['code'], 'plan-draft-missing', 'the failure is on the ledger as the step failing, like its siblings');
    } finally {
      await t.fx.dispose();
    }
  });

  it('a plan named with --plan is run as it is, with no question', async () => {
    const t = await taskFixture();
    try {
      await t.fx.repo.write(PLAN, DRAFT);
      await t.start({ text: 'go', plan: PLAN });
      assert.equal((await t.kinds('gate')).filter((print) => print['gate'] === 'plan-unaccepted').length, 0);
      assert.match(await readFile(path.join(t.fx.repo.root, PLAN), 'utf8'), /status: draft/);
    } finally {
      await t.fx.dispose();
    }
  });

  it('an accepted plan raises nothing', async () => {
    const t = await taskFixture();
    try {
      await t.fx.repo.write(PLAN, DRAFT.replace('draft', 'accepted'));
      await planNote(t);
      await t.start({ text: 'ord-7' });
      assert.equal((await t.kinds('gate')).filter((print) => print['gate'] === 'plan-unaccepted').length, 0);
    } finally {
      await t.fx.dispose();
    }
  });
});

describe('an investigation named by path reaches the plan and the task', () => {
  it('a task folder in the request attaches that task\'s latest investigation to the task brief', async () => {
    const t = await taskFixture();
    try {
      await t.fx.repo.write(NOTE, 'Old finding.\n');
      await t.fx.repo.write(NEWER, 'The total lives in `src/orders.ts`.\n');
      await t.start({ text: 'add totals, see .ambicode/tasks/ord-9' });
      assert.match(await t.work(), new RegExp(`Investigation: ${NEWER.replaceAll('.', '\\.')}`));
    } finally {
      await t.fx.dispose();
    }
  });

  it('the plan route points at an investigation named by path and seeds its map from it', async () => {
    const plan = await planFixture({ shipped: true });
    try {
      await plan.fx.repo.write(NOTE, 'The limit lives in `src/orders/limit.ts`.\n');
      const first = await plan.start({ text: `add totals, see ${NOTE}` });
      assert.match(first.text, new RegExp(`Investigation: ${NOTE.replaceAll('.', '\\.')}\\. Read it first`));
      assert.match(first.text, /## map/);
      assert.equal((await plan.fx.kinds('ORD-17', 'map')).length, 1);
    } finally {
      await plan.dispose();
    }
  });

  it('the plan route of a task that has an investigation note points at it and maps the files it cites, without being told its path', async () => {
    const plan = await planFixture({ shipped: true });
    try {
      const dir = await resolveTaskDir(plan.fx.runtime, 'ORD-17');
      const saved = '.ambicode/tasks/ORD-17/investigation_2026-10-01T10-00.md';
      await plan.fx.repo.write(saved, 'The total is computed in `src/orders.ts`.\n');
      await appendLedger(plan.fx.runtime.fs, dir.root, plan.fx.runtime.clock.now(), { kind: 'note', route: 'investigate-1', note: 'investigation', path: saved, contentHash: 'sha256:0' });
      const first = await plan.start({ text: 'add a discount' });
      assert.match(first.text, new RegExp(`Investigation: ${saved.replaceAll('.', '\\.')}\\. Read it first`));
      const map = (await plan.fx.kinds('ORD-17', 'map')).at(-1);
      assert.ok(Number(map?.['candidates']) > 0, `candidates ${String(map?.['candidates'])}`);
    } finally {
      await plan.dispose();
    }
  });

  it('a path outside .ambicode/tasks is not read', async () => {
    const plan = await planFixture({ shipped: true });
    try {
      await plan.fx.repo.write('notes/investigation_x.md', 'secret\n');
      const first = await plan.start({ text: 'add totals, see notes/investigation_x.md' });
      assert.doesNotMatch(first.text, /Investigation:/);
    } finally {
      await plan.dispose();
    }
  });
});
