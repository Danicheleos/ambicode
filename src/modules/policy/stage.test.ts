import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initConfig } from '#testing/fixtures/init-config';
import { createRuntime } from '#composition/root';
import { openWorkspace, projectForRequest } from '#modules/config/workspace';
import { CONFIG_HEAD } from '#testing/fixtures/route-fixture';
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

  it('a project pack rule renders as pack/rule (authority): instruction at before-work only, and is counted in the entry', async () => {
    const fx = await styleRepo(1);
    try {
      const before = await policyStage({ runtime: fx.runtime, project: fx.project, activity: 'task', paths: ['src/a.ts'], stage: 'before-work', show: true });
      assert.match(before.text, /^team\/style-0 \(team\): Style rule 0\.$/m);
      assert.ok(before.entry.rules >= 1);
      const report = await policyStage({ runtime: fx.runtime, project: fx.project, activity: 'task', paths: ['src/a.ts'], stage: 'before-report', show: true });
      assert.doesNotMatch(report.text, /team\/style-0/);
    } finally {
      await fx.temp.dispose();
    }
  });

  it('a plan stage carries only plan rules and a task stage only task rules, each smaller than the all-rules review stage', async () => {
    const { temp, runtime, project } = await repo();
    try {
      const plan = await policyStage({ runtime, project, activity: 'plan', paths: ['src/a.ts'], stage: 'before-work', show: true });
      const task = await policyStage({ runtime, project, activity: 'task', paths: ['src/a.ts'], stage: 'before-work', show: true });
      assert.match(plan.text, /common-design\/need /);
      assert.doesNotMatch(plan.text, /common-(code|verification)\/(naming|effects|test-behavior) /);
      assert.match(task.text, /common-code\/naming /);
      assert.doesNotMatch(task.text, /common-(design|security)\/(need|cohesion|data-boundary) /);
      const review = await policyStage({ runtime, project, activity: 'review', paths: ['src/a.ts'], stage: 'before-work', show: true });
      assert.equal(review.entry.rules, plan.entry.rules + task.entry.rules - 2 + 5, 'review carries all 24: fix-the-cause and reuse sit in plan and task, five rules are review-only');
      for (const id of ['honest-gaps', 'scope', 'callers', 'no-secret-exposure', 'untrusted-input-allowlist', 'outbound-timeouts', 'configured-logger']) assert.match(review.text, new RegExp(`common-[a-z]+/${id} `), id);
      assert.doesNotMatch(plan.text + task.text, /honest-gaps|no-secret-exposure|untrusted-input-allowlist|outbound-timeouts|configured-logger/);
      assert.match(plan.text, /common-design\/scope /);
      assert.doesNotMatch(plan.text, /common-code\/callers /);
      assert.match(task.text, /common-code\/callers /);
      assert.doesNotMatch(task.text, /common-design\/scope /);
      // Measured 2566 B plan / 3100 B task after scope, callers, no-check-evasion and unobserved-async (was 2441 / 2424), rounded up to 64 B.
      assert.ok(plan.bytes <= 2624, `plan ${plan.bytes}`);
      assert.ok(task.bytes <= 3136, `task ${task.bytes}`);
      for (const payload of [plan, task]) assert.ok(payload.bytes < review.bytes, `${payload.bytes} vs ${review.bytes}`);
    } finally {
      await temp.dispose();
    }
  });

  it('03-P1/03-P3: each stage stays under its byte cap unless --show or the reviewer reads it; the entry fields describe what was delivered', async () => {
    const { temp, runtime, project } = await repo();
    try {
      const review = await policyStage({ runtime, project, activity: 'review', paths: ['src/a.ts'], stage: 'before-work', show: false });
      assert.ok(review.bytes > STAGE_LIMITS['before-work'], `review ${review.bytes}: the whole set is over the cap, so this proves it is not cut`);
      assert.doesNotMatch(review.text, /\d+ more: `policy/);
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
  await temp.write('.ambicode/config.yaml', [CONFIG_HEAD, '  - id: web', '    root: .', '    paths: []', '    ecosystem: { languages: [typescript], frameworks: [], packageManager: null }', '    packs: []', '    policyFiles: [".ambicode/policies/team.yaml"]', '    commands: {}', '    checks: {}', ''].join('\n'));
  await temp.commitAll('rules');
  const runtime = await createRuntime({ cwd: temp.root });
  return { temp, runtime, project: projectForRequest((await openWorkspace(runtime)).config, null, []) };
}

describe('rules follow the files at hand', () => {
  it('a rule scoped to **/*.py is absent for .ts paths, present for a .py path, and kept when no path is known', async () => {
    const fx = await styleRepo(0);
    try {
      await fx.temp.write('.ambicode/policies/team.yaml', ['schemaVersion: 1', 'id: team', 'authority: team', 'appliesTo: ["**/*"]', 'activities: [task]', 'source: { location: "fixture" }', 'rules:', '  - id: py-only', '    category: correctness', '    instruction: Close files you open.', '    appliesTo: ["**/*.py"]', '    check: { kind: reviewer, explanation: x }', ''].join('\n'));
      const at = async (paths: string[]) => (await policyStage({ runtime: fx.runtime, project: fx.project, activity: 'task', paths, stage: 'before-work', show: true })).text;
      assert.doesNotMatch(await at(['src/a.ts']), /team\/py-only/);
      assert.match(await at(['tools/x.py']), /team\/py-only/);
      assert.match(await at([]), /team\/py-only/);
    } finally {
      await fx.temp.dispose();
    }
  });
});

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
