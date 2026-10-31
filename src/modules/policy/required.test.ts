import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '#composition/root';
import { openWorkspace, projectForRequest } from '#modules/config/workspace';
import { initConfig } from '#testing/fixtures/init-config';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { changesPaths, requiredPlanRules } from './required.ts';

describe('changesPaths', () => {
  it('takes the anchored paths under *Changes* bullets and stops at Goal, Checks and the next heading', () => {
    const plan = [
      '# Plan', 'Context cites `src/ctx.ts:9`.', '', '## Iteration 1: x',
      '- *Goal*: totals gain a term (`src/goal.ts:1`).',
      '- *Changes*:',
      '  - `src/invoices/service.ts:3-6`: add the term',
      '  - `tests/invoices.test.ts`: new file, no line',
      '- *Changes*: `src/inline.ts:4` too',
      '- *Checks*: `src/check.ts:2`',
      '## Iteration 2: y',
      'Changes: src/second.ts:7',
      '',
      '## Assumptions', '- src/after.ts:3',
    ].join('\n');
    assert.deepEqual(changesPaths(plan), ['src/invoices/service.ts', 'src/inline.ts', 'src/second.ts']);
  });

  it('is empty for a plan with no Changes bullets', () => {
    assert.deepEqual(changesPaths('# Plan\n\nSee src/a.ts:1.\n'), []);
  });
});

describe('requiredPlanRules', () => {
  async function fixture() {
    const temp = await TempRepo.create();
    await temp.write('src/a.ts', 'export const a = 1;\n');
    await temp.write('.ambicode/policies/team.yaml', ['schemaVersion: 1', 'id: team', 'authority: team', 'appliesTo: ["src/**"]', 'activities: [plan]', 'source: { location: "fixture" }', 'rules:',
      '  - id: onpush', '    category: architecture', '    instruction: Declare OnPush.', '    check: { kind: reviewer, explanation: x }',
      '  - id: everywhere', '    category: correctness', '    instruction: Close what you open.', '    check: { kind: reviewer, explanation: x }', ''].join('\n'));
    await temp.commitAll('init');
    const runtime = await createRuntime({ cwd: temp.root });
    await initConfig(runtime);
    const config = (await openWorkspace(runtime)).config;
    const base = projectForRequest(config, null, []);
    return { temp, runtime, project: { ...base, policyFiles: ['.ambicode/policies/team.yaml'], packs: [] } };
  }

  it('requires the delivered rules the Changes paths reach: every rule of a pack a path lands in, whatever the file type, nothing outside the pack scope', async () => {
    const fx = await fixture();
    try {
      const delivered = ['team/onpush', 'team/everywhere'];
      const required = (paths: string[], list = delivered) => requiredPlanRules({ runtime: fx.runtime, project: fx.project, paths, delivered: list });
      assert.deepEqual(await required(['src/a.service.ts']), ['team/everywhere', 'team/onpush']);
      assert.deepEqual(await required(['docs/readme.md']), [], 'outside the pack\'s appliesTo');
      assert.deepEqual(await required([]), []);
      assert.deepEqual(await required(['src/a.component.ts'], ['team/onpush']), ['team/onpush'], 'only what was delivered');
    } finally {
      await fx.temp.dispose();
    }
  });
});
