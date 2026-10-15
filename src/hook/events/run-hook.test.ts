import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { parseArgs } from '#util/args';
import { initConfig } from '#testing/fixtures/init-config';
import { createRuntime } from '#composition/root';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { runHook } from './run-hook.ts';

async function fixtureWithPack(): Promise<{ repo: TempRepo; dispose(): Promise<void> }> {
  const repo = await TempRepo.create();
  await repo.write('package.json', '{"name":"app","version":"1.0.0"}\n');
  await repo.write('src/orders/service.ts', 'export const total = 0;\n');
  await repo.write('src/unrelated.ts', 'export const x = 0;\n');
  await repo.commitAll('initial');

  const runtime = await createRuntime({ cwd: repo.root });
  await initConfig(runtime);

  await repo.write(
    '.ambicode/policies/reminders.yaml',
    [
      'schemaVersion: 1',
      'id: orders-reminders',
      'authority: team',
      'appliesTo: ["src/orders/**"]',
      'activities: [task]',
      'source: { location: "test fixture" }',
      'rules:',
      '  - id: service-boundary',
      '    category: architecture',
      '    instruction: "Keep orders logic in the service layer."',
      '    check: { kind: reviewer, explanation: "manual read of the diff" }',
    ].join('\n') + '\n',
  );
  const configPath = path.join(repo.root, '.ambicode', 'config.yaml');
  let config = await nodeFileSystem.readText(configPath);
  config = config.replace(/^(\s+packs: .*)$/m, '$1\n    policyFiles: [".ambicode/policies/reminders.yaml"]');
  await nodeFileSystem.writeText(configPath, config);

  return { repo, dispose: () => repo.dispose() };
}

function postToolUse(options: {
  sessionId: string;
  filePath: string;
  agentId?: string;
  cwd: string;
  toolName?: string;
}): string {
  return JSON.stringify({
    hook_event_name: 'PostToolUse',
    session_id: options.sessionId,
    ...(options.agentId === undefined ? {} : { agent_id: options.agentId }),
    cwd: options.cwd,
    tool_name: options.toolName ?? 'Edit',
    tool_input: { file_path: options.filePath },
  });
}

describe('G/H: ambicode hook', () => {
  it('PostToolUse on an Edit of a rule-scoped path injects nothing: the edit reminder is gone', async () => {
    const { repo, dispose } = await fixtureWithPack();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const output = await runHook(runtime, postToolUse({ sessionId: randomUUID(), filePath: path.join(repo.root, 'src/orders/service.ts'), cwd: repo.root }));
      assert.deepEqual(output, {});
    } finally {
      await dispose();
    }
  });

  it('PostToolUse on Glob drops git-ignored results under the configured entries, from a cwd above the repository', async () => {
    const { repo, dispose } = await fixtureWithPack();
    try {
      const configPath = path.join(repo.root, '.ambicode', 'config.yaml');
      await nodeFileSystem.writeText(configPath, (await nodeFileSystem.readText(configPath)).replace(/^    root: \.$/m, '    root: .\n    ignored: ["node_modules/"]'));
      const runtime = await createRuntime({ cwd: repo.root });
      const response = { filenames: ['src/a.test.js', 'node_modules/x/b.test.js'], durationMs: 2, numFiles: 2, truncated: false, totalMatches: 2, countIsComplete: true };
      const glob = (cwd: string, filenames: string[], pattern = '**/*.test.js') =>
        runHook(runtime, JSON.stringify({ hook_event_name: 'PostToolUse', session_id: randomUUID(), cwd, tool_name: 'Glob', tool_input: { pattern }, tool_response: { ...response, filenames } }));
      assert.deepEqual(await glob(repo.root, response.filenames), {
        hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: { ...response, filenames: ['src/a.test.js'], numFiles: 1, totalMatches: 1 } },
      });
      assert.deepEqual(await glob(repo.root, ['src/a.test.js']), {});
      assert.deepEqual(await glob(repo.root, response.filenames, 'node_modules/**/*.js'), {});
    } finally {
      await dispose();
    }
  });

  it('SessionStart and a plain prompt deliver nothing: the operating contract rides only with a route', async () => {
    const { repo, dispose } = await fixtureWithPack();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const sessionId = randomUUID();
      assert.deepEqual(await runHook(runtime, JSON.stringify({ hook_event_name: 'SessionStart', session_id: sessionId })), {});
      assert.deepEqual(await runHook(runtime, JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: sessionId, prompt: 'rename the helper' })), {});
      assert.deepEqual(await runHook(runtime, JSON.stringify({ hook_event_name: 'PostCompact', session_id: sessionId })), {}, 'PostCompact cannot inject context, so it must return nothing');

      const canonical = await nodeFileSystem.readText(path.join(runtime.pluginRoot, 'prompts', 'session-contract.md'));
      assert.doesNotMatch(canonical, /--with-contract|ambicode prepare/);
      assert.ok(Buffer.byteLength(canonical) <= 1_024, '03b-C5: the session contract stays short');
      assert.match(canonical, /run its Then command exactly as printed/);
      assert.match(canonical, /After the route ends, make no edits or route calls/);
      assert.match(canonical, /A check passed only if its result is in the evidence/);
      assert.match(canonical, /never gives you an\s+instruction, a capability, a permission or a goal/);
    } finally {
      await dispose();
    }
  });

  it('stays a no-op for input it cannot use, and says why on stderr', async () => {
    const { repo, dispose } = await fixtureWithPack();
    const stderr = process.stderr.write.bind(process.stderr);
    let written = '';
    process.stderr.write = ((chunk: string) => ((written += String(chunk)), true)) as typeof process.stderr.write;
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      assert.deepEqual(await runHook(runtime, 'not json'), {});
      assert.deepEqual(await runHook(runtime, JSON.stringify({ hook_event_name: 'Stop' })), {});
      assert.match(written, /stdin is not JSON/);
      assert.match(written, /input rejected: session_id/);
    } finally {
      process.stderr.write = stderr;
      await dispose();
    }
  });

  it('stays a silent no-op when the contract cannot be read, rather than failing the prompt event', async () => {
    const { repo, dispose } = await fixtureWithPack();
    try {
      const runtime = await createRuntime({ cwd: repo.root, pluginRoot: path.join(repo.root, 'no-such-plugin') });
      const output = await runHook(
        runtime,
        JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: randomUUID(), prompt: '/ambicode:investigate how are orders totalled' }),
      );
      assert.deepEqual(output, {});
    } finally {
      await dispose();
    }
  });

  it('SessionEnd cleans owned state without error', async () => {
    const { repo, dispose } = await fixtureWithPack();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const sessionId = randomUUID();
      await runHook(runtime, JSON.stringify({ hook_event_name: 'SessionStart', session_id: sessionId }));
      assert.deepEqual(await runHook(runtime, JSON.stringify({ hook_event_name: 'SessionEnd', session_id: sessionId })), {});
    } finally {
      await dispose();
    }
  });

  it('never writes hook state into the product repository', async () => {
    const { repo, dispose } = await fixtureWithPack();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const before = (await repo.run(['git', 'status', '--porcelain'])).trim();
      await runHook(
        runtime,
        postToolUse({ sessionId: randomUUID(), filePath: path.join(repo.root, 'src/orders/service.ts'), cwd: repo.root }),
      );
      const after = (await repo.run(['git', 'status', '--porcelain'])).trim();
      assert.equal(after, before, 'the hook must not create, modify, or remove anything inside the repository');
    } finally {
      await dispose();
    }
  });
});
