import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { parseArgs } from '../cli/args.ts';
import { INIT_OPTIONS, runInit } from '../cli/commands/init.ts';
import { createRuntime } from '../composition/root.ts';
import { nodeFileSystem } from '../ports/filesystem.ts';
import { TempRepo } from '../testing/temp-repo.ts';
import { PREPARE_OPTIONS, runPrepare } from '../cli/commands/prepare.ts';
import { runHook } from './run-hook.ts';

/**
 * doc 04 P2.4 corrections G/H: the packaged PostToolUse/SessionStart/
 * PostCompact/SessionEnd hook entry point. Never invokes the real bundled
 * CLI process here (that is `hooks-artifact.test.mjs`'s job); this exercises
 * `runHook` directly against a real git fixture, exactly like every other
 * AMBICODE module test.
 */

async function fixtureWithPack(options: { editReminders?: boolean } = {}): Promise<{ repo: TempRepo; dispose(): Promise<void> }> {
  const repo = await TempRepo.create();
  await repo.write('package.json', '{"name":"app","version":"1.0.0"}\n');
  await repo.write('src/orders/service.ts', 'export const total = 0;\n');
  await repo.write('src/unrelated.ts', 'export const x = 0;\n');
  await repo.commitAll('initial');

  const runtime = await createRuntime({ cwd: repo.root });
  await runInit(runtime, parseArgs('init', [], INIT_OPTIONS));

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
      '    remindOnEdit: true',
    ].join('\n') + '\n',
  );
  const configPath = path.join(repo.root, '.ambicode', 'config.yaml');
  let config = await nodeFileSystem.readText(configPath);
  config = config.replace('policyFiles: []', 'policyFiles: [".ambicode/policies/reminders.yaml"]');
  if (options.editReminders === false) {
    config = config.replace(/authoring:\s*\n\s*editReminders:\s*true/, 'authoring:\n  editReminders: false');
  }
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

describe('G/H: ambicode hook (PostToolUse edit reminders)', () => {
  it('delivers a matching reminder with qualified id, authority, category, instruction, check, provenance, hash and the "not proof" disclaimer', async () => {
    const { repo, dispose } = await fixtureWithPack();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const sessionId = randomUUID();
      const output = (await runHook(
        runtime,
        postToolUse({ sessionId, filePath: path.join(repo.root, 'src/orders/service.ts'), cwd: repo.root }),
      )) as { hookSpecificOutput?: { hookEventName: string; additionalContext: string } };

      assert.equal(output.hookSpecificOutput?.hookEventName, 'PostToolUse');
      const text = output.hookSpecificOutput?.additionalContext ?? '';
      assert.match(text, /orders-reminders\/service-boundary/);
      assert.match(text, /team/);
      assert.match(text, /architecture/);
      assert.match(text, /Keep orders logic in the service layer\./);
      assert.match(text, /manual read of the diff/);
      assert.match(text, /orders-reminders/); // pack provenance
      assert.match(text, /content: sha256:/);
      assert.match(text, /reminder applied on your NEXT model request, not proof/i);
    } finally {
      await dispose();
    }
  });

  it('is silent for a path outside the reminder pack\'s scope', async () => {
    const { repo, dispose } = await fixtureWithPack();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const output = await runHook(
        runtime,
        postToolUse({ sessionId: randomUUID(), filePath: path.join(repo.root, 'src/unrelated.ts'), cwd: repo.root }),
      );
      assert.deepEqual(output, {});
    } finally {
      await dispose();
    }
  });

  it('is silent when there is no AMBICODE config (G5)', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('src/app.ts', 'export const a = 1;\n');
      await repo.commitAll('initial');
      const runtime = await createRuntime({ cwd: repo.root });
      const output = await runHook(
        runtime,
        postToolUse({ sessionId: randomUUID(), filePath: path.join(repo.root, 'src/app.ts'), cwd: repo.root }),
      );
      assert.deepEqual(output, {});
    } finally {
      await repo.dispose();
    }
  });

  it('is silent when authoring.editReminders is false (G5)', async () => {
    const { repo, dispose } = await fixtureWithPack({ editReminders: false });
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const output = await runHook(
        runtime,
        postToolUse({ sessionId: randomUUID(), filePath: path.join(repo.root, 'src/orders/service.ts'), cwd: repo.root }),
      );
      assert.deepEqual(output, {});
    } finally {
      await dispose();
    }
  });

  it('is silent for a path outside the repository (G5)', async () => {
    const { repo, dispose } = await fixtureWithPack();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const output = await runHook(
        runtime,
        postToolUse({ sessionId: randomUUID(), filePath: path.join(path.dirname(repo.root), 'outside.ts'), cwd: repo.root }),
      );
      assert.deepEqual(output, {});
    } finally {
      await dispose();
    }
  });

  it('is silent for a non-Edit/Write tool, and for malformed/oversized input', async () => {
    const { repo, dispose } = await fixtureWithPack();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const bash = await runHook(
        runtime,
        JSON.stringify({
          hook_event_name: 'PostToolUse',
          session_id: randomUUID(),
          cwd: repo.root,
          tool_name: 'Bash',
          tool_input: { command: 'rm -rf /' },
        }),
      );
      assert.deepEqual(bash, {});

      const malformed = await runHook(runtime, '{ this is not json');
      assert.deepEqual(malformed, {});

      const empty = await runHook(runtime, '');
      assert.deepEqual(empty, {});
    } finally {
      await dispose();
    }
  });

  it('H5: delivers the same rule on the same path once per epoch; H6: delivers again for a different path', async () => {
    const { repo, dispose } = await fixtureWithPack();
    try {
      await repo.write('src/orders/other.ts', 'export const y = 0;\n');
      const runtime = await createRuntime({ cwd: repo.root });
      const sessionId = randomUUID();

      const first = (await runHook(
        runtime,
        postToolUse({ sessionId, filePath: path.join(repo.root, 'src/orders/service.ts'), cwd: repo.root }),
      )) as Record<string, unknown>;
      assert.ok('hookSpecificOutput' in first);

      const second = await runHook(
        runtime,
        postToolUse({ sessionId, filePath: path.join(repo.root, 'src/orders/service.ts'), cwd: repo.root }),
      );
      assert.deepEqual(second, {}, 'the same rule on the same path in one epoch is delivered once');

      const otherPath = (await runHook(
        runtime,
        postToolUse({ sessionId, filePath: path.join(repo.root, 'src/orders/other.ts'), cwd: repo.root }),
      )) as Record<string, unknown>;
      assert.ok('hookSpecificOutput' in otherPath, 'the same rule on a different path is delivered once for that path');
    } finally {
      await dispose();
    }
  });

  it('H1: a subagent (distinct agent_id) gets its own delivery, independent of the main thread', async () => {
    const { repo, dispose } = await fixtureWithPack();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const sessionId = randomUUID();
      const filePath = path.join(repo.root, 'src/orders/service.ts');

      const main = (await runHook(runtime, postToolUse({ sessionId, filePath, cwd: repo.root }))) as Record<string, unknown>;
      assert.ok('hookSpecificOutput' in main);

      const subagent = (await runHook(
        runtime,
        postToolUse({ sessionId, filePath, cwd: repo.root, agentId: 'subagent-1' }),
      )) as Record<string, unknown>;
      assert.ok('hookSpecificOutput' in subagent, 'a distinct agent identity is not deduplicated against the main thread');
    } finally {
      await dispose();
    }
  });

  it('H4: a changed rule content hash is delivered again without waiting for a new session', async () => {
    const { repo, dispose } = await fixtureWithPack();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const sessionId = randomUUID();
      const filePath = path.join(repo.root, 'src/orders/service.ts');

      const first = await runHook(runtime, postToolUse({ sessionId, filePath, cwd: repo.root }));
      assert.ok('hookSpecificOutput' in (first as object));

      // Change the rule's instruction text: same qualified id, new content hash.
      const packPath = path.join(repo.root, '.ambicode/policies/reminders.yaml');
      const pack = await nodeFileSystem.readText(packPath);
      await nodeFileSystem.writeText(
        packPath,
        pack.replace('Keep orders logic in the service layer.', 'Keep orders logic in the service layer, always.'),
      );

      const second = (await runHook(runtime, postToolUse({ sessionId, filePath, cwd: repo.root }))) as Record<string, unknown>;
      assert.ok('hookSpecificOutput' in second, 'a changed rule content hash must be redelivered');
    } finally {
      await dispose();
    }
  });

  it('H3: SessionStart resets delivery so the same rule/path is delivered again', async () => {
    const { repo, dispose } = await fixtureWithPack();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const sessionId = randomUUID();
      const filePath = path.join(repo.root, 'src/orders/service.ts');

      const first = await runHook(runtime, postToolUse({ sessionId, filePath, cwd: repo.root }));
      assert.ok('hookSpecificOutput' in (first as object));

      const dedup = await runHook(runtime, postToolUse({ sessionId, filePath, cwd: repo.root }));
      assert.deepEqual(dedup, {});

      const reset = (await runHook(
        runtime,
        JSON.stringify({ hook_event_name: 'SessionStart', session_id: sessionId }),
      )) as Record<string, unknown>;
      // The reset also carries the shared operating contract for the fresh
      // epoch (R2 change 2); the reset itself is what this test is about.
      assert.ok('hookSpecificOutput' in reset);

      const afterReset = (await runHook(runtime, postToolUse({ sessionId, filePath, cwd: repo.root }))) as Record<string, unknown>;
      assert.ok('hookSpecificOutput' in afterReset, 'delivery must resume after a SessionStart reset');
    } finally {
      await dispose();
    }
  });

  it('R2 change 2: SessionStart and PostCompact put the shared operating contract into context once per epoch', async () => {
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
        path.join(runtime.pluginRoot, 'prompts', 'shared-operating-contract.md'),
      );
      // The whole contract, not a summary of it: `prepare` stopped sending it,
      // so this is the only copy the session gets.
      assert.ok(delivered.includes(canonical.trimEnd()));
      assert.match(delivered, /--with-contract/);

      // A second event in the same epoch does not repeat it — that repetition
      // is exactly the cost this change removes.
      const again = await runHook(
        runtime,
        JSON.stringify({ hook_event_name: 'PostCompact', session_id: sessionId, agent_id: undefined }),
      );
      const secondEpoch = (again as { hookSpecificOutput?: unknown }).hookSpecificOutput;
      assert.ok(secondEpoch !== undefined, 'PostCompact starts a new epoch, which is a new delivery');

      // And `prepare` in that session carries the contract by reference only.
      const prepared = await runPrepare(
        runtime,
        parseArgs('prepare', ['--activity', 'task'], PREPARE_OPTIONS),
      );
      assert.equal(prepared.json, 'compact');
      assert.equal(
        (prepared.data as { sharedOperatingContract: { content?: string } }).sharedOperatingContract.content,
        undefined,
      );
    } finally {
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

  it('PostCompact also resets delivery, and SessionEnd cleans owned state without error', async () => {
    const { repo, dispose } = await fixtureWithPack();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const sessionId = randomUUID();
      const filePath = path.join(repo.root, 'src/orders/service.ts');

      await runHook(runtime, postToolUse({ sessionId, filePath, cwd: repo.root }));
      await runHook(runtime, JSON.stringify({ hook_event_name: 'PostCompact', session_id: sessionId }));
      const afterCompact = (await runHook(runtime, postToolUse({ sessionId, filePath, cwd: repo.root }))) as Record<string, unknown>;
      assert.ok('hookSpecificOutput' in afterCompact);

      const ended = await runHook(runtime, JSON.stringify({ hook_event_name: 'SessionEnd', session_id: sessionId }));
      assert.deepEqual(ended, {});
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
