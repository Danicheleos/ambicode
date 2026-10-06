import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../cli/args.ts';
import { initConfig } from '../testing/init-config.ts';
import { POLICY_OPTIONS, renderPolicy, runPolicy } from '../cli/commands/policy.ts';
import { createRuntime, openWorkspace, projectForRequest } from '../composition/root.ts';
import { TempRepo } from '../testing/temp-repo.ts';
import { policyStage, STAGE_LIMITS } from './stage.ts';

async function repo() {
  const temp = await TempRepo.create();
  await temp.write('package.json', '{"name":"app","version":"1.0.0"}\n');
  await temp.write('src/a.ts', 'export const a = 1;\n');
  await temp.commitAll('initial');
  const runtime = await createRuntime({ cwd: temp.root });
  await initConfig(runtime);
  const workspace = await openWorkspace(runtime);
  return { temp, runtime, project: projectForRequest(workspace.config, null, []) };
}

describe('03-P policy stage', () => {
  it('03-P2: investigate carries no rules and says how many were left out and where to read them; task carries them as pack/rule (authority): instruction', async () => {
    const { temp, runtime, project } = await repo();
    try {
      const investigate = await policyStage({ runtime, project, activity: 'investigate', paths: [], stage: 'before-work', show: false });
      assert.doesNotMatch(investigate.text, /^Rules:/m);
      assert.equal(investigate.entry.rules, 0);
      if (investigate.entry.omitted > 0) assert.match(investigate.text, new RegExp(`rulesOmitted: ${investigate.entry.omitted} \\(read them: policy --activity investigate --stage before-work --show\\)`));
      const task = await policyStage({ runtime, project, activity: 'task', paths: ['src/a.ts'], stage: 'before-work', show: true });
      if (task.entry.rules > 0) assert.match(task.text, /^[a-z0-9-]+\/[a-z0-9-]+ \([a-z-]+\): .+/m);
      assert.equal(task.entry.omitted, 0);
    } finally {
      await temp.dispose();
    }
  });

  it('03-P1/03-P3: each stage stays under its byte cap unless --show; the entry fields describe what was delivered', async () => {
    const { temp, runtime, project } = await repo();
    try {
      for (const stage of ['before-work', 'before-report'] as const) {
        const payload = await policyStage({ runtime, project, activity: 'task', paths: ['src/a.ts'], stage, show: false });
        assert.ok(payload.bytes <= STAGE_LIMITS[stage], `${stage}: ${payload.bytes}`);
        assert.deepEqual(Object.keys(payload.entry).sort(), ['bytes', 'omitted', 'packs', 'rules', 'stage']);
        assert.equal(payload.entry.bytes, payload.bytes);
        assert.equal(payload.entry.stage, stage);
      }
      assert.equal(STAGE_LIMITS['before-work'], 4096);
      assert.equal(STAGE_LIMITS['before-report'], 1536);
    } finally {
      await temp.dispose();
    }
  });

  it('03-P1: overflow is cut with "<n> more" and the --show command; --show returns the whole text', async () => {
    const { temp, runtime, project } = await repo();
    try {
      const cut = await policyStage({ runtime, project, activity: 'task', paths: ['src/a.ts'], stage: 'before-report', show: false });
      const whole = await policyStage({ runtime, project, activity: 'task', paths: ['src/a.ts'], stage: 'before-report', show: true });
      assert.ok(whole.bytes > STAGE_LIMITS['before-report'], `the built-in rules must overflow the cap: ${whole.bytes}`);
      assert.match(cut.text, /\n\d+ more: `policy --activity task --stage before-report --show`$/);
      assert.doesNotMatch(whole.text, /\d+ more: `policy/);
      assert.ok(cut.bytes <= STAGE_LIMITS['before-report'] && cut.bytes < whole.bytes);
    } finally {
      await temp.dispose();
    }
  });

  it('the policy command prints the stage with --stage and refuses --show alone', async () => {
    const { temp, runtime } = await repo();
    try {
      const output = await runPolicy(runtime, parseArgs('policy', ['--activity', 'investigate', '--stage', 'before-report'], POLICY_OPTIONS));
      assert.equal(renderPolicy(output), output.stage!.text);
      await assert.rejects(runPolicy(runtime, parseArgs('policy', ['--show'], POLICY_OPTIONS)), (error: Error & { code?: string }) => error.code === 'bad-argument');
      await assert.rejects(runPolicy(runtime, parseArgs('policy', ['--stage', 'later'], POLICY_OPTIONS)), (error: Error & { code?: string }) => error.code === 'bad-argument');
    } finally {
      await temp.dispose();
    }
  });
});
