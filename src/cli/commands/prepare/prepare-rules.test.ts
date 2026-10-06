import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRuntime } from '#composition/root';
import type { PrepareCompactOutput } from '#types/prepare';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { parseArgs } from '../../args.ts';
import { runPolicy } from '../policy/policy.ts';
import { runPrepare } from './prepare.ts';
import { PREPARE_OPTIONS } from '#types/cli';
import { POLICY_OPTIONS } from '../../types/commands.ts';

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

async function compactFor(repo: TempRepo, activity: string): Promise<PrepareCompactOutput> {
  const run = await runPrepare(await createRuntime({ cwd: repo.root }), parseArgs('prepare', ['--activity', activity, '--json'], PREPARE_OPTIONS));
  return run.data as PrepareCompactOutput;
}

function carried(output: PrepareCompactOutput): string[] {
  return output.policy.packs.flatMap((pack) => (pack.rules ?? []).map((rule) => rule.id)).sort();
}

describe('prepare carries only the rules the activity acts on', () => {
  it('investigate carries none, and names how many it left out and the command that reads them', async () => {
    const repo = await repoWithTwoRules();
    try {
      const output = await compactFor(repo, 'investigate');
      assert.deepEqual(carried(output), []);
      assert.deepEqual(output.policy.rulesOmitted, { count: 2, read: 'ambicode policy --activity investigate --json [--rule <pack/rule>]...' });
      assert.ok(output.policy.packs.some((pack) => pack.id === 'team'), 'the pack stays listed');
    } finally {
      await repo.dispose();
    }
  });

  it('plan leaves out code-style rules only', async () => {
    const repo = await repoWithTwoRules();
    try {
      const output = await compactFor(repo, 'plan');
      assert.deepEqual(carried(output), ['no-secrets']);
      assert.equal(output.policy.rulesOmitted?.count, 1);
    } finally {
      await repo.dispose();
    }
  });

  it('task carries every rule and reports nothing omitted', async () => {
    const repo = await repoWithTwoRules();
    try {
      const output = await compactFor(repo, 'task');
      assert.deepEqual(carried(output), ['naming', 'no-secrets']);
      assert.equal(output.policy.rulesOmitted, undefined);
    } finally {
      await repo.dispose();
    }
  });

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
