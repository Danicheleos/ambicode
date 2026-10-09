import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AmbicodeConfig, ProjectConfig } from '#types/modules/config';
import type { ResolvedPolicy } from '#types/modules/policy';
import { DEFAULTS } from '#types/defaults';
import { Git } from '#platform/git/git';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { FakeProcessRunner } from '#testing/fakes/fake-process-runner';
import { runChecks, type RunChecksOptions } from './run.ts';

const config = { checks: { ...DEFAULTS.checks } } as AmbicodeConfig;

const policy: ResolvedPolicy = {
  activity: 'task', projectId: 'web', packs: [], rules: [], prompts: [], diagnostics: [],
  commandDecisions: ['lint', 'unit', 'pick'].map((command) => ({
    command, action: 'run' as const, sources: [{ packId: 't', packReference: 't', action: 'run' as const }],
  })),
};

const project: ProjectConfig = {
  id: 'web', root: '.', ecosystem: 'typescript', packs: [], policyFiles: [],
  commands: { lint: { argv: ['eslint', '{files}'] }, unit: { argv: ['jest', '{files}'] }, pick: { argv: ['pick'] } },
  checks: {
    lint: { command: 'lint', adapter: 'eslint', include: ['**/*.ts'] },
    unit: { command: 'unit', adapter: 'jest', include: ['**/*.spec.ts'], selector: { kind: 'mapping', mappings: [{ source: ['src/**/*.ts'], tests: ['**/*.spec.ts'] }] } },
  },
} as ProjectConfig;

async function options(t: { after(fn: () => unknown): void }, runner: FakeProcessRunner, extra: Partial<RunChecksOptions>): Promise<RunChecksOptions> {
  const root = await mkdtemp(path.join(tmpdir(), 'ambicode-only-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await new NodeProcessRunner().run({ argv: ['git', 'init', '-q', '.'], cwd: root, timeoutMs: 30_000, maxOutputBytes: 65_536, env: { kind: 'inherited' } });
  return {
    fs: nodeFileSystem, config, project, policy, changed: [], repositoryRoot: root, runner,
    clock: { now: () => new Date(0), elapsed: () => 0 }, approvals: new Set(), declines: new Set(),
    reviewDirectory: root, enumerationRevision: null, git: new Git({ runner: new NodeProcessRunner(), repositoryRoot: root }),
    watchedPaths: [], revisionNote: null, ...extra,
  };
}

describe('runChecks only', () => {
  it('07-C2 runs only the named check on exactly the given files, with no selector', async (t) => {
    const runner = new FakeProcessRunner();
    const { results, pendingApprovals } = await runChecks(await options(t, runner, { only: { checkId: 'unit', files: ['src/a.spec.ts', './src/b.spec.ts'] } }));
    assert.deepEqual(runner.argvs(), [['jest', 'src/a.spec.ts', 'src/b.spec.ts']]);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.checkId, 'unit');
    assert.equal(results[0]?.selectionComplete, true);
    assert.deepEqual(results[0]?.selected, [
      { path: 'src/a.spec.ts', reason: 'named with --only' },
      { path: 'src/b.spec.ts', reason: 'named with --only' },
    ]);
    assert.deepEqual(pendingApprovals, []);
  });

  it('07-C2 files outside the include globs still run when named', async (t) => {
    const runner = new FakeProcessRunner();
    await runChecks(await options(t, runner, { only: { checkId: 'lint', files: ['docs/x.md'] } }));
    assert.deepEqual(runner.argvs(), [['eslint', 'docs/x.md']]);
  });

  it('07-C2 an unknown check id runs nothing', async (t) => {
    const runner = new FakeProcessRunner();
    const { results } = await runChecks(await options(t, runner, { only: { checkId: 'e2e', files: ['a.ts'] } }));
    assert.deepEqual(results, []);
    assert.deepEqual(runner.argvs(), []);
  });
});
