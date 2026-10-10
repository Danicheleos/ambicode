import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initConfig } from '#testing/fixtures/init-config';
import { createRuntime } from '#composition/root';
import { openWorkspace, projectForRequest } from '#modules/config/workspace';
import { TempRepo } from '#testing/fixtures/temp-repo';
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
  it('03-P2: before-work carries rules as pack/rule (authority): instruction for every activity', async () => {
    const { temp, runtime, project } = await repo();
    try {
      for (const activity of ['investigate', 'task'] as const) {
        const payload = await policyStage({ runtime, project, activity, paths: ['src/a.ts'], stage: 'before-work', show: true });
        if (payload.entry.rules > 0) assert.match(payload.text, /^[a-z0-9-]+\/[a-z0-9-]+ \([a-z-]+\): .+/m);
        assert.doesNotMatch(payload.text, /rulesOmitted/);
      }
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
        assert.deepEqual(Object.keys(payload.entry).sort(), ['bytes', 'packs', 'rules', 'stage']);
        assert.equal(payload.entry.bytes, payload.bytes);
        assert.equal(payload.entry.stage, stage);
      }
      assert.equal(STAGE_LIMITS['before-work'], 4096);
      assert.equal(STAGE_LIMITS['before-report'], 1536);
    } finally {
      await temp.dispose();
    }
  });

  it('11 §2: before-report carries no rule; before-work carries the built-in rules within its cap, cut or whole', async () => {
    const { temp, runtime, project } = await repo();
    try {
      const report = await policyStage({ runtime, project, activity: 'task', paths: ['src/a.ts'], stage: 'before-report', show: true });
      assert.equal(report.entry.rules, 0);
      const cut = await policyStage({ runtime, project, activity: 'task', paths: ['src/a.ts'], stage: 'before-work', show: false });
      const whole = await policyStage({ runtime, project, activity: 'task', paths: ['src/a.ts'], stage: 'before-work', show: true });
      assert.ok(whole.entry.rules > 0 && cut.bytes <= STAGE_LIMITS['before-work']);
      assert.doesNotMatch(whole.text, /\d+ more: `policy/);
      const checks = await policyStage({ runtime, project, activity: 'task', paths: ['src/a.ts'], stage: 'before-checks', show: true });
      assert.equal(checks.entry.rules, 0, 'few code-style rules go before work, so none are left for the checks');
    } finally {
      await temp.dispose();
    }
  });
});

async function styleRepo(count: number, filler = ''): Promise<{ temp: TempRepo; runtime: Awaited<ReturnType<typeof createRuntime>>; project: ReturnType<typeof projectForRequest> }> {
  const temp = await TempRepo.create();
  await temp.write('src/a.ts', 'export const a = 1;\n');
  const rules = Array.from({ length: count }, (_, index) => [`  - id: style-${index}`, '    category: code-style', `    instruction: ${JSON.stringify(`Style rule ${index}.${filler}`)}`, '    check: { kind: reviewer, explanation: "Judged from the diff." }']).flat();
  await temp.write('.ambicode/policies/team.yaml', ['schemaVersion: 1', 'id: team', 'authority: team', 'appliesTo: ["**/*"]', 'activities: [review, task, plan, investigate]', 'source: { location: "fixture" }', 'rules:', ...rules, '  - id: no-secrets', '    category: security', '    instruction: Never log a token.', '    check: { kind: reviewer, explanation: "Judged from the diff." }', ''].join('\n'));
  await temp.write('.ambicode/config.yaml', ['schemaVersion: 1', 'baseline: ""', 'review: { model: sonnet, timeoutSeconds: 300, maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288 }', 'checks: { timeoutSeconds: 120 }', 'requirements: { mcpServer: null }', 'projects:', '  - id: web', '    root: .', '    ecosystem: typescript', '    packs: []', '    policyFiles: [".ambicode/policies/team.yaml"]', '    commands: {}', '    checks: {}', ''].join('\n'));
  await temp.commitAll('rules');
  const runtime = await createRuntime({ cwd: temp.root });
  return { temp, runtime, project: projectForRequest((await openWorkspace(runtime)).config, null, []) };
}

describe('before-work carries every rule', () => {
  it('code-style rules stay in before-work whatever their number, and before-checks carries none', async () => {
    const fx = await styleRepo(12);
    try {
      const work = await policyStage({ runtime: fx.runtime, project: fx.project, activity: 'task', paths: ['src/a.ts'], stage: 'before-work', show: true });
      const checks = await policyStage({ runtime: fx.runtime, project: fx.project, activity: 'task', paths: ['src/a.ts'], stage: 'before-checks', show: true });
      assert.equal(work.text.split('\n').filter((line) => /^team\/style-\d+ /.test(line)).length, 12);
      assert.match(work.text, /team\/no-secrets/);
      assert.equal(checks.entry.rules, 0);
    } finally {
      await fx.temp.dispose();
    }
  });

  it('an overflowing before-work is cut under its cap with the --show pointer', async () => {
    const fx = await styleRepo(40, ` ${'x'.repeat(200)}`);
    try {
      const work = await policyStage({ runtime: fx.runtime, project: fx.project, activity: 'task', paths: ['src/a.ts'], stage: 'before-work', show: false });
      assert.ok(work.bytes <= STAGE_LIMITS['before-work'], `${work.bytes}`);
      assert.match(work.text, /more: `policy --activity task --stage before-work --show`$/);
    } finally {
      await fx.temp.dispose();
    }
  });
});
