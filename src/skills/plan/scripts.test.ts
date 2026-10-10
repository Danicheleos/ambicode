import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { planFixture, PLAN_TASK } from '#testing/fixtures/plan-fixture';
import { materialized } from '#testing/fixtures/materialized';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { REPO_ROOT } from '#testing/paths';

async function check(root: string, body: string) {
  const steps = path.join(root, '.ambicode/tasks/t/steps');
  await mkdir(steps, { recursive: true });
  await writeFile(path.join(steps, 'plan-body.md'), body);
  const outcome = await new NodeProcessRunner().run({
    argv: [process.execPath, path.join(REPO_ROOT, 'skills/plan/scripts/plan-check.mjs')],
    cwd: root,
    timeoutMs: 30_000,
    maxOutputBytes: 65_536,
    env: { kind: 'inherited' },
    stdin: JSON.stringify({ task: 't', skill: 'plan', repositoryRoot: root, taskDir: path.join(root, '.ambicode/tasks/t'), steps, args: {}, params: [], revise: null, raisedBy: null, headless: false }),
  });
  assert.equal(outcome.exitCode, 0, outcome.stderr);
  return JSON.parse(outcome.stdout) as { entries: { summary: { failed: boolean; anchorsBad: number; anchors?: string[] } }[]; failed?: { code: string; revise: { args: Record<string, string[]> } } };
}

describe('skills/plan/scripts/plan-check.mjs', () => {
  it('accepts anchors that exist, rejects a missing file and a line past the end, and ignores fenced code', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const good = await check(root, '# Plan\n\n`src/invoices/service.ts:3-6` and `src/invoices/service.ts:3`\n');
      assert.equal(good.failed, undefined);
      assert.equal(good.entries[0]!.summary.anchorsBad, 0);
      const bad = await check(root, '# Plan\n\n`src/invoices/service.ts:900` `src/nope.ts:1` `../outside.ts:1`\n\n```\nsrc/ignored.ts:1\n```\n');
      assert.equal(bad.failed?.code, 'plan-check-failed');
      assert.equal(bad.entries[0]!.summary.anchorsBad, 3);
      assert.equal(bad.failed?.revise.args['Plan check failed']?.length, 3);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('runs as the plan-check step: the failure comes back to plan-write and the record stays', async () => {
    const plan = await planFixture({ shipped: true });
    try {
      await plan.start();
      await plan.next();
      await plan.body('# Plan\n\n`src/orders/limit.ts:99`\n');
      const back = await plan.next();
      assert.equal(back.position, 'plan-write');
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'worker')).length, 1);
    } finally {
      await plan.dispose();
    }
  });
});
