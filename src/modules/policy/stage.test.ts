import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initConfig } from '#testing/fixtures/init-config';
import { createRuntime } from '#composition/root';
import { openWorkspace, projectForRequest } from '#modules/config/workspace';
import { CONFIG_HEAD } from '#testing/fixtures/route-fixture';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { policyStage } from './stage.ts';

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
  it('03-P2: before-work carries rules as pack/rule: instruction under an authority header for every activity', async () => {
    const { temp, runtime, project } = await repo();
    try {
      for (const activity of ['investigate', 'task'] as const) {
        const payload = await policyStage({ runtime, project, activity, paths: ['src/a.ts'], stage: 'before-work' });
        if (payload.entry.rules > 0) assert.match(payload.text, /^Rules \((team|observed|inherited)\):\n[a-z0-9-]+\/[a-z0-9-]+: .+/m);
        assert.doesNotMatch(payload.text, /rulesOmitted/);
      }
    } finally {
      await temp.dispose();
    }
  });

  it('a project pack rule renders as pack/rule: instruction under its authority header and is counted in the entry', async () => {
    const fx = await styleRepo(1);
    try {
      const before = await policyStage({ runtime: fx.runtime, project: fx.project, activity: 'task', paths: ['src/a.ts'], stage: 'before-work' });
      assert.match(before.text, /^Rules \(team\):$/m);
      assert.match(before.text, /^team\/style-0: Style rule 0\.$/m);
      assert.ok(before.entry.rules >= 1);
    } finally {
      await fx.temp.dispose();
    }
  });

  it('a plan stage carries only plan rules and a task stage only task rules, each smaller than the all-rules review stage', async () => {
    const fixture = await repo();
    const { temp, runtime } = fixture;
    try {
      const project = fixture.project;
      const plan = await policyStage({ runtime, project, activity: 'plan', paths: ['src/a.ts'], stage: 'before-work' });
      const task = await policyStage({ runtime, project, activity: 'task', paths: ['src/a.ts'], stage: 'before-work' });
      assert.match(plan.text, /common-design\/need: /);
      assert.doesNotMatch(plan.text, /common-(code|verification)\/(naming|effects|test-behavior): /);
      assert.match(task.text, /common-code\/naming: /);
      assert.doesNotMatch(task.text, /common-(design|security)\/(need|cohesion|data-boundary): /);
      const review = await policyStage({ runtime, project, activity: 'review', paths: ['src/a.ts'], stage: 'before-work' });
      // Deliberate: the reviewer agent's own checklist covers five rules, so they no longer reach review.
      const planTaskOnly = ['dead-surface', 'callers', 'error-honesty'];
      assert.equal(review.entry.rules, plan.entry.rules + task.entry.rules - 2 - planTaskOnly.length + 5, 'review carries 20 of 23: fix-the-cause and reuse sit in plan and task (-2), three plan/task rules skip review, five rules are review-only');
      for (const id of planTaskOnly) assert.doesNotMatch(review.text, new RegExp(`common-[a-z]+/${id}: `), `${id} must not reach review`);
      for (const id of ['honest-gaps', 'scope', 'no-secret-exposure', 'untrusted-input-allowlist', 'outbound-timeouts', 'configured-logger']) assert.match(review.text, new RegExp(`common-[a-z]+/${id}: `), id);
      assert.doesNotMatch(plan.text + task.text, /honest-gaps|no-secret-exposure|untrusted-input-allowlist|outbound-timeouts|configured-logger/);
      assert.match(plan.text, /common-design\/scope: /);
      assert.doesNotMatch(plan.text, /common-code\/callers: /);
      assert.match(task.text, /common-code\/callers: /);
      assert.doesNotMatch(task.text, /common-design\/scope: /);
      // Measured 2463 B plan / 2964 B task / 4237 B review (about 430 B more with reuse-before-reimplementing on review) with authority headers and five rules off review (was 2559 / 3096 / 5693), rounded up to 64 B.
      assert.ok(plan.bytes <= 2496, `plan ${plan.bytes}`);
      assert.ok(task.bytes <= 3008, `task ${task.bytes}`);
      for (const payload of [plan, task]) assert.ok(payload.bytes < review.bytes, `${payload.bytes} vs ${review.bytes}`);
    } finally {
      await temp.dispose();
    }
  });

  it('03-P1/03-P3: every stage delivers its rules whole; the entry fields describe what was delivered', async () => {
    const { temp, runtime, project } = await repo();
    try {
      const review = await policyStage({ runtime, project, activity: 'review', paths: ['src/a.ts'], stage: 'before-work' });
      assert.doesNotMatch(review.text, /\d+ more, in /);
      const payload = await policyStage({ runtime, project, activity: 'task', paths: ['src/a.ts'], stage: 'before-work' });
      assert.doesNotMatch(payload.text, /\d+ more, in /);
      assert.deepEqual(Object.keys(payload.entry).sort(), ['activity', 'bytes', 'ids', 'packs', 'problems', 'rules', 'stage']);
      assert.equal(payload.entry.ids.length, payload.entry.rules);
      assert.equal(payload.entry.bytes, payload.bytes);
    } finally {
      await temp.dispose();
    }
  });

  it('11 §2: before-work carries the built-in rules, uncut', async () => {
    const { temp, runtime, project } = await repo();
    try {
      const work = await policyStage({ runtime, project, activity: 'task', paths: ['src/a.ts'], stage: 'before-work' });
      assert.ok(work.entry.rules > 0);
      assert.doesNotMatch(work.text, /\d+ more, in /);
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
  it('a pack scoped to **/*.py is absent for .ts paths, present for a .py path, and kept when no path is known', async () => {
    const fx = await styleRepo(0);
    try {
      await fx.temp.write('.ambicode/policies/team.yaml', ['schemaVersion: 1', 'id: team', 'authority: team', 'appliesTo: ["**/*.py"]', 'activities: [task]', 'source: { location: "fixture" }', 'rules:', '  - id: py-only', '    category: correctness', '    instruction: Close files you open.', '    check: { kind: reviewer, explanation: x }', ''].join('\n'));
      const at = async (paths: string[]) => (await policyStage({ runtime: fx.runtime, project: fx.project, activity: 'task', paths, stage: 'before-work' })).text;
      assert.doesNotMatch(await at(['src/a.ts']), /team\/py-only/);
      assert.match(await at(['tools/x.py']), /team\/py-only/);
      assert.match(await at([]), /team\/py-only/);
    } finally {
      await fx.temp.dispose();
    }
  });
});

describe('before-work carries every rule', () => {
  it('code-style rules stay in before-work whatever their number', async () => {
    const fx = await styleRepo(12);
    try {
      const work = await policyStage({ runtime: fx.runtime, project: fx.project, activity: 'task', paths: ['src/a.ts'], stage: 'before-work' });
      assert.equal(work.text.split('\n').filter((line) => /^team\/style-\d+: /.test(line)).length, 12);
      assert.match(work.text, /team\/no-secrets/);
    } finally {
      await fx.temp.dispose();
    }
  });

  it('a task before-work far over the old 4096 B cap arrives whole: every instruction in full, every id listed, no pointer line', async () => {
    const filler = ` ${'x'.repeat(200)}`;
    const fx = await styleRepo(40, filler);
    try {
      const work = await policyStage({ runtime: fx.runtime, project: fx.project, activity: 'task', paths: ['src/a.ts'], stage: 'before-work' });
      assert.ok(work.bytes > 4096, `${work.bytes}: over the old cap`);
      assert.doesNotMatch(work.text, /\d+ more, in |\.ambicode\/policies\//);
      for (let index = 0; index < 40; index++) assert.ok(work.text.includes(`team/style-${index}: Style rule ${index}.${filler}`), `style-${index} whole`);
      assert.match(work.text, /team\/no-secrets: Never log a token\./);
      assert.equal(work.entry.ids.length, 41);
      assert.equal(work.entry.rules, 41);
      assert.equal(work.entry.bytes, work.bytes);
    } finally {
      await fx.temp.dispose();
    }
  });
});

describe('rules are grouped under one header per authority', () => {
  it('team rules come before inherited ones, each under its own header, and no header counts as a rule', async () => {
    const fx = await styleRepo(3, ` ${'x'.repeat(300)}`);
    try {
      const config = await fx.runtime.fs.readText(`${fx.temp.root}/.ambicode/config.yaml`);
      await fx.temp.write('.ambicode/config.yaml', config.replace('packs: []', 'packs: [builtin/common-code]'));
      const project = projectForRequest((await openWorkspace(fx.runtime)).config, null, []);
      const at = (activity: 'task' | 'review') => policyStage({ runtime: fx.runtime, project, activity, paths: ['src/a.ts'], stage: 'before-work' });
      const whole = await at('review');
      const headers = whole.text.split('\n').filter((line) => line.startsWith('Rules ('));
      assert.deepEqual(headers, ['Rules (team):', 'Rules (inherited):']);
      assert.ok(whole.text.indexOf('team/style-0:') < whole.text.indexOf('Rules (inherited):') && whole.text.indexOf('Rules (inherited):') < whole.text.indexOf('common-code/naming:'));
      assert.doesNotMatch(whole.text, /^[a-z-]+\/[a-z-]+ \(/m, 'no per-line authority suffix');
      const task = await at('task');
      assert.ok(task.text.startsWith('Rules (team):'), 'headers also lead a task payload');
      assert.ok(task.text.includes('Rules (inherited):'));
    } finally {
      await fx.temp.dispose();
    }
  });
});

describe('plan gets every rule whole', () => {
  it('60 long rules arrive whole and uncut, with no pointer line and every id listed', async () => {
    const filler = ` ${'Because the reason runs long. '.repeat(10)}`;
    const fx = await styleRepo(60, filler);
    try {
      const plan = await policyStage({ runtime: fx.runtime, project: fx.project, activity: 'plan', paths: ['src/a.ts'], stage: 'before-work' });
      assert.ok(plan.text.includes(`team/style-0: Style rule 0.${filler}`), 'the whole instruction');
      assert.ok(plan.text.includes(`team/style-59: Style rule 59.${filler}`), 'no alphabetical cut');
      assert.doesNotMatch(plan.text, /\d+ more, in /);
      assert.ok(plan.bytes > 4096, `${plan.bytes}: over 4096 B, and not cut`);
      assert.equal(plan.entry.ids.length, plan.entry.rules);
      assert.ok(plan.entry.ids.includes('team/style-59'));
    } finally {
      await fx.temp.dispose();
    }
  });

  it('a pack scoped to **/*.py still follows the map paths for plan', async () => {
    const fx = await styleRepo(0);
    try {
      await fx.temp.write('.ambicode/policies/team.yaml', ['schemaVersion: 1', 'id: team', 'authority: team', 'appliesTo: ["**/*.py"]', 'activities: [plan]', 'source: { location: "fixture" }', 'rules:', '  - id: py-only', '    category: correctness', '    instruction: Close files you open.', '    check: { kind: reviewer, explanation: x }', ''].join('\n'));
      const at = async (paths: string[]) => (await policyStage({ runtime: fx.runtime, project: fx.project, activity: 'plan', paths, stage: 'before-work' })).text;
      assert.doesNotMatch(await at(['src/a.ts']), /team\/py-only/);
      assert.match(await at(['tools/x.py']), /team\/py-only/);
    } finally {
      await fx.temp.dispose();
    }
  });

  it('built-in plan rules arrive as whole instructions, none cut to a first sentence', async () => {
    const { temp, runtime, project } = await repo();
    try {
      const plan = await policyStage({ runtime, project, activity: 'plan', paths: [], stage: 'before-work' });
      const lines = plan.text.split('\n').filter((line) => /^[\w-]+\/[\w-]+: /.test(line));
      assert.ok(lines.length > 3);
      assert.ok(lines.every((line) => !line.endsWith('…')));
      assert.ok(lines.some((line) => line.replace(/^[^:]+: /, '').length > 110), 'a rule longer than the old 110-character line');
    } finally {
      await temp.dispose();
    }
  });
});
