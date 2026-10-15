import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { planFixture, PLAN_TASK } from '#testing/fixtures/plan-fixture';
import { materialized } from '#testing/fixtures/materialized';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { REPO_ROOT } from '#testing/paths';

async function check(root: string, body: string, params: string[] = []) {
  const steps = path.join(root, '.ambicode/tasks/t/steps');
  await mkdir(steps, { recursive: true });
  await writeFile(path.join(steps, 'plan-body.md'), body);
  const outcome = await new NodeProcessRunner().run({
    argv: [process.execPath, path.join(REPO_ROOT, 'skills/plan/scripts/plan-check.mjs')],
    cwd: root,
    timeoutMs: 30_000,
    maxOutputBytes: 65_536,
    env: { kind: 'inherited' },
    stdin: JSON.stringify({ task: 't', skill: 'plan', repositoryRoot: root, taskDir: path.join(root, '.ambicode/tasks/t'), steps, args: {}, params, revise: null, raisedBy: null, headless: false }),
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

  it('resolve completes a partial path naming one tracked file and leaves an ambiguous or missing one to the check', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const steps = path.join(root, '.ambicode/tasks/t/steps');
      const resolved = await check(root, '# Plan\n\n`invoices.ts:1` and `invoices/service.ts:3-6`\n', ['resolve']);
      assert.match(JSON.stringify(resolved.entries), /invoices\.ts:1 → src\/routes\/invoices\.ts:1; invoices\/service\.ts:3-6 → src\/invoices\/service\.ts:3-6/);
      assert.equal(await readFile(path.join(steps, 'plan-body.md'), 'utf8'), '# Plan\n\n`src/routes/invoices.ts:1` and `src/invoices/service.ts:3-6`\n');
      const after = await check(root, await readFile(path.join(steps, 'plan-body.md'), 'utf8'));
      assert.equal(after.failed, undefined);
      // The run that failed: a bare name two files share, in a plan that anchors one of their directories.
      await check(root, '# Plan\n\n`src/invoices/model.ts:1`; same throw style as `service.ts:4`\n', ['resolve']);
      assert.equal(await readFile(path.join(steps, 'plan-body.md'), 'utf8'), '# Plan\n\n`src/invoices/model.ts:1`; same throw style as `src/invoices/service.ts:4`\n');
      const kept = await check(root, '# Plan\n\n`service.ts:3` `invoices.ts:900` `nope.ts:1`\n', ['resolve']);
      assert.deepEqual(kept.entries, []);
      assert.equal(await readFile(path.join(steps, 'plan-body.md'), 'utf8'), '# Plan\n\n`service.ts:3` `invoices.ts:900` `nope.ts:1`\n');
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  // 9 of 10 audited plan-check failures were the form of the path, not a missing file.
  it('resolve rewrites an absolute path inside the repository and one led by the repository directory name, and keeps a bad one for the check', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const steps = path.join(root, '.ambicode/tasks/t/steps');
      const name = path.basename(root);
      const resolved = await check(root, `# Plan\n\n\`${root}/src/invoices/service.ts:3-6\` and \`${name}/src/invoices/service.ts:3\`\n`, ['resolve']);
      assert.equal(await readFile(path.join(steps, 'plan-body.md'), 'utf8'), '# Plan\n\n`src/invoices/service.ts:3-6` and `src/invoices/service.ts:3`\n');
      assert.match(JSON.stringify(resolved.entries), /resolved: /);
      assert.equal((await check(root, await readFile(path.join(steps, 'plan-body.md'), 'utf8'))).failed, undefined);
      const bad = `# Plan\n\n\`${root}/src/invoices/service.ts:900\` \`${name}/src/nope.ts:1\` \`/etc/hosts.txt:1\`\n`;
      await check(root, bad, ['resolve']);
      assert.equal(await readFile(path.join(steps, 'plan-body.md'), 'utf8'), bad);
      const checked = await check(root, bad);
      assert.equal(checked.entries[0]!.summary.anchorsBad, 3);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('runs as the plan-check step: the failure comes back to design and the record stays', async () => {
    const plan = await planFixture({ shipped: true });
    try {
      await plan.start();
      await plan.body('# Plan\n\n`src/orders/limit.ts:99`\n');
      const back = await plan.next();
      assert.equal(back.position, 'design');
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'worker')).length, 1);
    } finally {
      await plan.dispose();
    }
  });
});
