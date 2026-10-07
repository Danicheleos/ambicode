import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PLAN_TASK, planFixture, type PlanFixture } from '#testing/fixtures/plan-fixture';
import { routeFixture } from '#testing/fixtures/route-fixture';
import { reviseTo } from '../gates/answers.ts';
import { RAISED_BY } from '#types/harness';
import { SESSION_A } from '#testing/fixtures/ids';

type Row = Record<string, unknown>;

const ledgerFile = (root: string, task: string): string => path.join(root, '.ambicode', 'task', task, 'ledger.jsonl');

/** Keeps the ledger up to and including the last line that `stop` matches: the crash happened right after it. */
async function crashAfter(root: string, task: string, stop: (row: Row) => boolean): Promise<void> {
  const file = ledgerFile(root, task);
  const lines = (await readFile(file, 'utf8')).trim().split('\n');
  const index = lines.findLastIndex((line) => stop(JSON.parse(line) as Row));
  await writeFile(file, `${lines.slice(0, index + 1).join('\n')}\n`);
}

const repaired = async (plan: PlanFixture, which: string): Promise<Row[]> =>
  (await plan.fx.ledger(PLAN_TASK)).filter((entry) => String(entry['source'] ?? '').startsWith(`repair:${which}:`));

describe('crash repair', () => {
  it('R1: an answer whose revise was never written gets exactly one, and a second repair adds nothing', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      const print = (await plan.prints()).at(-1)!;
      await plan.hook('plan-accept', 'Revise', print.id);
      await crashAfter(plan.fx.repo.root, PLAN_TASK, (row) => row['kind'] === 'acceptance');
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'revise')).filter((entry) => entry['via'] === 'gate').length, 0);
      await plan.next();
      await plan.next();
      const rows = await repaired(plan, 'R1');
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!['kind'], 'revise');
      assert.equal(rows[0]!['from'], 'design');
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'revise')).filter((entry) => entry['via'] === 'gate').length, 1);
    } finally {
      await plan.dispose();
    }
  });

  it('R2: a failed step with no onFail revise gets exactly one', async () => {
    const plan = await planFixture();
    try {
      plan.state.checkOk = false;
      await plan.start();
      await plan.next();
      await plan.body('# Plan\n');
      await plan.next();
      await crashAfter(plan.fx.repo.root, PLAN_TASK, (row) => row['kind'] === 'step' && row['status'] === 'failed');
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'revise')).filter((entry) => entry['from'] === 'plan-write').length, 0);
      plan.state.checkOk = true;
      await plan.next();
      await plan.next();
      const rows = (await repaired(plan, 'R2')).filter((entry) => entry.kind === 'revise');
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!['from'], 'plan-write');
      assert.equal((await repaired(plan, 'R2')).length, 2);
    } finally {
      await plan.dispose();
    }
  });

  it('R3: a handler exit recorded on the step but never written is written once', async () => {
    const route = 'skill: ex\nversion: 3\nbudget: { modelSteps: 4 }\nexits: [done, blocked, human, inconclusive, superseded, budget]\nrevisable: []\nsteps:\n  - id: work\n    actor: code\n    run: [t.work]\n  - id: after\n    actor: model\n    instruction: "Go on."\n';
    const fx = await routeFixture({ routes: { ex: route }, handlers: { 't.work': async () => ({ state: 'ok', payload: null, exit: 'blocked' }) } });
    try {
      await fx.engine.start({ skill: 'ex', text: 'x', requirements: [], task: 't1', cwd: fx.repo.root, session: SESSION_A, channel: 'hook' });
      assert.equal((await fx.kinds('t1', 'exit')).length, 1);
      await crashAfter(fx.repo.root, 't1', (row) => row['kind'] === 'step' && row['status'] === 'completed');
      assert.equal((await fx.kinds('t1', 'exit')).length, 0);
      for (let turn = 0; turn < 2; turn += 1) await fx.engine.advance({ task: 't1', session: SESSION_A, cause: 'route-next' }).catch(() => undefined);
      const exits = await fx.kinds('t1', 'exit');
      assert.equal(exits.length, 1);
      assert.equal(exits[0]!['reason'], 'blocked');
      assert.equal(String(exits[0]!['source']).startsWith('repair:R3:'), true);
    } finally {
      await fx.dispose();
    }
  });

  it('a print lost to a crash does not count toward the three-print default', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      await plan.next();
      await crashAfter(plan.fx.repo.root, PLAN_TASK, (row) => row['kind'] === 'gate');
      await plan.next();
      await plan.next();
      assert.equal((await plan.prints()).length, 4);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'default-taken')).length, 0);
      await plan.next();
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'default-taken')).length, 1);
    } finally {
      await plan.dispose();
    }
  });

  it('a $raisedBy revise is bounded by maxRevises', async () => {
    const written: Row[] = [];
    const entries = [{ id: 'r1', kind: 'route', at: 'x', route: 'r1' }];
    const run = {
      def: { skill: 's', steps: [{ id: 'work', actor: 'model', repeat: 1, index: 0 }] },
      head: entries[0],
      entries,
      ledger: { append: async (row: Row) => { const entry = { id: `e${entries.length}`, at: 'x', route: 'r1', ...row }; entries.push(entry as never); written.push(entry); return entry; } },
    } as unknown as Parameters<typeof reviseTo>[0];
    const revise = { target: RAISED_BY, args: {} };
    const info = { reason: 'g: Again', gate: 'g', raisedBy: 'work', maxRevises: 2 };
    assert.equal(await reviseTo(run, revise, 'code', info), true);
    assert.equal(await reviseTo(run, revise, 'code', info), true);
    assert.equal(await reviseTo(run, revise, 'code', info), false);
    assert.deepEqual(written.map((row) => row['kind'] === 'limit' ? row['which'] : row['kind']), ['revise', 'revise', 'max-revises']);
    assert.equal(written[2]!['gate'], 'g', 'R1 matches the limit by gate, so it is not written again');
  });
});
