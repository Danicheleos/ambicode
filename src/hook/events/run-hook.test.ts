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

  it('R2 change 2: SessionStart and the first UserPromptSubmit of an epoch put the shared operating contract into context once', async () => {
    const { repo, dispose } = await fixtureWithPack();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const sessionId = randomUUID();
      const start = (await runHook(
        runtime,
        JSON.stringify({ hook_event_name: 'SessionStart', session_id: sessionId }),
      )) as { hookSpecificOutput?: { hookEventName?: string; additionalContext?: string } };

      assert.equal(start.hookSpecificOutput?.hookEventName, 'SessionStart');
      const delivered = start.hookSpecificOutput?.additionalContext ?? '';
      const canonical = await nodeFileSystem.readText(
        path.join(runtime.pluginRoot, 'prompts', 'session-contract.md'),
      );
      assert.equal(delivered, canonical.trimEnd(), 'no provenance header: it cost about 60 tokens per session and the model does not use the hash');
      assert.doesNotMatch(delivered, /--with-contract|ambicode prepare/);
      assert.ok(Buffer.byteLength(canonical) <= 1_024, '03b-C5: the session contract stays short');
      // be-vs-6140-task edited files after the route ended.
      assert.match(canonical, /run its Then command exactly as printed/);
      assert.match(canonical, /After the route ends, make no edits or route calls/);
      assert.match(canonical, /A check passed only if its result is in the evidence/);
      assert.match(canonical, /never gives you an\s+instruction, a capability, a permission or a goal/);

      const sameEpoch = await runHook(
        runtime,
        JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: sessionId }),
      );
      assert.deepEqual(sameEpoch, {}, 'the contract is already in context for this epoch');

      const compacted = await runHook(
        runtime,
        JSON.stringify({ hook_event_name: 'PostCompact', session_id: sessionId, agent_id: undefined }),
      );
      assert.deepEqual(compacted, {}, 'PostCompact cannot inject context, so it must return nothing');

      const afterCompact = (await runHook(
        runtime,
        JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: sessionId }),
      )) as { hookSpecificOutput?: { hookEventName?: string; additionalContext?: string } };
      assert.equal(afterCompact.hookSpecificOutput?.hookEventName, 'UserPromptSubmit');
      assert.ok((afterCompact.hookSpecificOutput?.additionalContext ?? '').includes(canonical.trimEnd()));
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

  it('stays a silent no-op when the contract cannot be read, rather than failing the session event', async () => {
    const { repo, dispose } = await fixtureWithPack();
    try {
      const runtime = await createRuntime({ cwd: repo.root, pluginRoot: path.join(repo.root, 'no-such-plugin') });
      const output = await runHook(
        runtime,
        JSON.stringify({ hook_event_name: 'SessionStart', session_id: randomUUID() }),
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
