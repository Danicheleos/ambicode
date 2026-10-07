import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRuntime } from '#composition/root';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { parseArgs } from '#util/args';
import { runPolicy, POLICY_OPTIONS } from './policy.ts';

async function repoWithTwoRules(): Promise<TempRepo> {
  const repo = await TempRepo.create();
  await repo.write('src/app.ts', 'export const a = 1;\n');
  await repo.write(
    '.ambicode/policies/team.yaml',
    [
      'schemaVersion: 1',
      'id: team',
      'authority: team',
      'appliesTo: ["**/*"]',
      'activities: [review, task, plan, investigate]',
      'source: { location: "test fixture" }',
      'rules:',
      '  - id: naming',
      '    category: code-style',
      '    instruction: Name handlers after the event.',
      '    check: { kind: reviewer, explanation: "Judged from the diff." }',
      '  - id: no-secrets',
      '    category: security',
      '    instruction: Never log a token.',
      '    check: { kind: reviewer, explanation: "Judged from the diff." }',
      '',
    ].join('\n'),
  );
  await repo.write(
    '.ambicode/config.yaml',
    [
      'schemaVersion: 1',
      'baseline: ""',
      'review: { model: sonnet, timeoutSeconds: 300, maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288 }',
      'checks: { timeoutSeconds: 120, maxSelectedTestFiles: 20 }',
      'page: { idleTimeoutSeconds: 1800 }',
      'requirements: { mcpServer: null }',
      'remoteChecks: { image: null }',
      'projects:',
      '  - id: web',
      '    root: .',
      '    ecosystem: typescript',
      '    packs: []',
      '    policyFiles: [".ambicode/policies/team.yaml"]',
      '    commands: {}',
      '    checks: {}',
      '',
    ].join('\n'),
  );
  await repo.commitAll('rules fixture');
  return repo;
}

describe('policy --rule', () => {
  it('policy --rule reads only the named rules, and refuses an id that does not apply', async () => {
    const repo = await repoWithTwoRules();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const only = await runPolicy(runtime, parseArgs('policy', ['--activity', 'task', '--rule', 'team/no-secrets'], POLICY_OPTIONS));
      assert.deepEqual(only.policy.rules.map((rule) => rule.qualifiedId), ['team/no-secrets']);

      const all = await runPolicy(runtime, parseArgs('policy', ['--activity', 'task'], POLICY_OPTIONS));
      assert.equal(all.policy.rules.length, 2);

      await assert.rejects(runPolicy(runtime, parseArgs('policy', ['--activity', 'task', '--rule', 'team/nope'], POLICY_OPTIONS)), /No rule applies here with id "team\/nope"/);
    } finally {
      await repo.dispose();
    }
  });
});
