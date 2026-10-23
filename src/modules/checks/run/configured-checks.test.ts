import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { checkFixture, CHECK_CONFIG } from '#testing/fixtures/check-fixture';
import { openWorkspace } from '#modules/config/workspace';
import { REPO_ROOT } from '#testing/paths';
import { runCheckOnly, runnableChecks } from './check-command.ts';
import { runFormat } from './format.ts';

// The pack a user copies from init: it names lint/unit/e2e only, and the project's checks are named differently.
const SHIPPED = (async () => (await readFile(path.join(REPO_ROOT, 'policies/common/common-checks.yaml'), 'utf8')).replace('rules: []', 'replaces: builtin/common-checks\nrules: []'))();
const CONFIG = CHECK_CONFIG.replace('unit: { all: "jest", file: "jest {file}" }', 'test: { all: "jest", file: "jest {file}" }')
  .replace('      e2e: { all: null, file: "pw {file}" }\n', '      e2e: { all: null, file: "pw {file}" }\n      "typecheck-spec": { all: "tsc -p spec", file: null }\n');

describe('a configured check runs unless a pack narrows it', () => {
  it('shipped common-checks: test and lint run on a file and format runs without being named in the pack', async () => {
    const env = await checkFixture({ pack: await SHIPPED, config: CONFIG });
    try {
      await env.start();
      assert.equal((await env.check({ name: 'test' })).outcome, 'ran');
      assert.equal((await env.check({ name: 'lint' })).outcome, 'ran');
      assert.deepEqual((await env.fx.kinds('ord-7', 'limit')).filter((entry) => entry['which'] === 'check-forbidden'), []);
      await env.fx.repo.write('src/b.ts', 'x\n');
      env.runner.out = { exitCode: 0 };
      const [entry] = await runFormat(env.deps(), { task: 'ord-7', waiting: [] });
      assert.equal(entry?.outcome, 'formatted');
    } finally {
      await env.fx.dispose();
    }
  });

  it('checks.runnable lists exactly what runs: configured checks, forbid and format left out', async () => {
    const env = await checkFixture({ pack: await SHIPPED, config: CONFIG });
    try {
      const workspace = await openWorkspace(env.runtime);
      const listed = await runnableChecks(workspace, workspace.config.projects[0]!);
      assert.deepEqual(listed.map((entry) => entry.key), ['e2e', 'lint', 'test', 'typecheck', 'typecheck-spec']);
    } finally {
      await env.fx.dispose();
    }
  });

  it('a pack that forbids a configured check removes it from the listing and refuses the run', async () => {
    const pack = (await SHIPPED).replace('commandPolicy:\n', 'commandPolicy:\n  - { command: test, action: forbid, reason: "CI owns it" }\n');
    const env = await checkFixture({ pack, config: CONFIG });
    try {
      await env.start();
      const workspace = await openWorkspace(env.runtime);
      assert.ok(!(await runnableChecks(workspace, workspace.config.projects[0]!)).some((entry) => entry.key === 'test'));
      await assert.rejects(runCheckOnly(env.deps(), { task: 'ord-7', name: 'test', project: null, files: ['src/a.spec.ts'], phase: 'red', approve: [], decline: [] }), { code: 'check-only-unauthorized' });
    } finally {
      await env.fx.dispose();
    }
  });
});

describe('the all form of a check asks, the per-file form runs freely', () => {
  it('a check with both forms: --file runs without approval, the all form waits for the user', async () => {
    const env = await checkFixture({ pack: await SHIPPED, config: CONFIG });
    try {
      await env.start();
      assert.equal((await env.check({ name: 'test', files: ['src/a.spec.ts'] })).outcome, 'ran');
      assert.equal((await env.check({ name: 'test', files: [] })).outcome, 'waiting');
      assert.equal(env.runner.calls.filter((call) => call[0] === 'jest').length, 0);
    } finally {
      await env.fx.dispose();
    }
  });

  it('a check with only the all form waits for the user', async () => {
    const env = await checkFixture({ pack: await SHIPPED, config: CONFIG });
    try {
      await env.start();
      assert.equal((await env.check({ name: 'typecheck', files: [] })).outcome, 'waiting');
      assert.equal((await env.check({ name: 'typecheck', files: [], approve: ['app/typecheck'] })).outcome, 'waiting');
    } finally {
      await env.fx.dispose();
    }
  });

  it('the listing names the forms that run freely and the ones that need approval', async () => {
    const env = await checkFixture({ pack: await SHIPPED, config: CONFIG });
    try {
      const workspace = await openWorkspace(env.runtime);
      const listed = await runnableChecks(workspace, workspace.config.projects[0]!);
      assert.deepEqual(listed.map((entry) => [entry.key, entry.approval]), [
        ['e2e', { file: true, all: false }], ['lint', { file: false, all: true }], ['test', { file: false, all: true }],
        ['typecheck', { file: false, all: true }], ['typecheck-spec', { file: false, all: true }],
      ]);
    } finally {
      await env.fx.dispose();
    }
  });
});
