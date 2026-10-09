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
  await temp.write('.ambicode/config.yaml', ['schemaVersion: 1', 'baseline: ""', 'review: { model: sonnet, timeoutSeconds: 300, maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288 }', 'checks: { timeoutSeconds: 120, maxSelectedTestFiles: 20 }', 'requirements: { mcpServer: null }', 'projects:', '  - id: web', '    root: .', '    ecosystem: typescript', '    packs: []', '    policyFiles: [".ambicode/policies/team.yaml"]', '    commands: {}', '    checks: {}', ''].join('\n'));
  await temp.commitAll('rules');
  const runtime = await createRuntime({ cwd: temp.root });
  return { temp, runtime, project: projectForRequest((await openWorkspace(runtime)).config, null, []) };
}

describe('07-G4 task code-style rules by stage', () => {
  const stageOf = async (fx: Awaited<ReturnType<typeof styleRepo>>, activity: 'task' | 'review' | 'plan', stage: 'before-work' | 'before-checks') => policyStage({ runtime: fx.runtime, project: fx.project, activity, paths: ['src/a.ts'], stage, show: false });
  const styleLines = (text: string): number => text.split('\n').filter((line) => /^team\/style-\d+ /.test(line)).length;

  it('07-G4: at most 8 code-style rules stay in before-work and before-checks carries none', async () => {
    const fx = await styleRepo(8);
    try {
      const work = await stageOf(fx, 'task', 'before-work');
      const checks = await stageOf(fx, 'task', 'before-checks');
      assert.equal(styleLines(work.text), 8);
      assert.match(work.text, /team\/no-secrets/);
      assert.equal(styleLines(checks.text), 0);
      assert.equal(checks.entry.rules, 0);
    } finally {
      await fx.temp.dispose();
    }
  });

  it('07-G4: with 9 code-style rules all move to before-checks and before-work keeps the others', async () => {
    const fx = await styleRepo(9);
    try {
      const work = await stageOf(fx, 'task', 'before-work');
      const checks = await stageOf(fx, 'task', 'before-checks');
      assert.equal(styleLines(work.text), 0);
      assert.match(work.text, /team\/no-secrets/);
      assert.equal(styleLines(checks.text), 9);
      assert.doesNotMatch(checks.text, /team\/no-secrets/);
      assert.ok(checks.bytes <= STAGE_LIMITS['before-checks']);
    } finally {
      await fx.temp.dispose();
    }
  });

  it('07-G4: the before-checks payload is capped at 1,536 bytes, with the --show pointer when it overflows', async () => {
    const fx = await styleRepo(12, ` ${'x'.repeat(200)}`);
    try {
      const checks = await stageOf(fx, 'task', 'before-checks');
      assert.equal(STAGE_LIMITS['before-checks'], 1536);
      assert.ok(checks.bytes <= 1536, `${checks.bytes}`);
      assert.match(checks.text, /more: `policy --activity task --stage before-checks --show`$/);
    } finally {
      await fx.temp.dispose();
    }
  });

  it('07-G4: other activities are unaffected by the split', async () => {
    const fx = await styleRepo(9);
    try {
      const review = await stageOf(fx, 'review', 'before-work');
      assert.equal(styleLines(review.text), 9);
      assert.equal(styleLines((await stageOf(fx, 'review', 'before-checks')).text), 0);
      assert.equal(styleLines((await stageOf(fx, 'plan', 'before-work')).text), 0, 'plan never carries code-style');
    } finally {
      await fx.temp.dispose();
    }
  });
});
