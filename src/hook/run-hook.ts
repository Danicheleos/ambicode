import path from 'node:path';
import {
  createRuntime,
  openRepository,
  projectForPath,
  resolvePolicyFor,
  toRepositoryRelative,
  type Runtime,
} from '../composition/root.ts';
import { loadConfig } from '../config/load.ts';
import type { AmbicodeConfig } from '../contracts/config.ts';
import type { ResolvedRule } from '../contracts/policy.ts';
import {
  EMPTY_HOOK_OUTPUT,
  HookInput,
  type AdditionalContextEvent,
  type AdditionalContextHookOutput,
  type PostToolUseHookOutput,
} from '../contracts/hook.ts';
import { readSharedOperatingContract } from '../policy/shared-contract.ts';
import { contentHash } from '../util/hash.ts';
import {
  alreadyDelivered,
  cleanupSessionState,
  currentEpoch,
  hookStateBaseDir,
  markDelivered,
  resetEpoch,
  type DeliveryKey,
} from './markers.ts';

export const MAX_HOOK_INPUT_BYTES = 1_048_576;

/**
 * Never throws: any failure is a silent no-op, because a hook is advisory and
 * must never block or alter the tool call that already happened.
 */
export async function runHook(runtime: Runtime, rawStdin: string): Promise<unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawStdin);
  } catch {
    return EMPTY_HOOK_OUTPUT;
  }
  const result = HookInput.safeParse(parsed);
  if (!result.success) return EMPTY_HOOK_OUTPUT;
  const input = result.data;

  try {
    switch (input.hook_event_name) {
      case 'SessionStart': {
        const base = hookStateBaseDir(runtime.fs, input.session_id, input.scratchpad_dir);
        await resetEpoch(runtime.fs, runtime.ids, base);
        return await deliverSharedContract(runtime, input, base, 'SessionStart');
      }
      case 'PostCompact': {
        // A compaction invalidates earlier deliveries, but this event has no
        // `hookSpecificOutput` variant in Claude Code's schema (returning one fails
        // validation), so the next `UserPromptSubmit` delivers the contract instead.
        const base = hookStateBaseDir(runtime.fs, input.session_id, input.scratchpad_dir);
        await resetEpoch(runtime.fs, runtime.ids, base);
        return EMPTY_HOOK_OUTPUT;
      }
      case 'UserPromptSubmit': {
        const base = hookStateBaseDir(runtime.fs, input.session_id, input.scratchpad_dir);
        return await deliverSharedContract(runtime, input, base, 'UserPromptSubmit');
      }
      case 'SessionEnd': {
        const base = hookStateBaseDir(runtime.fs, input.session_id, input.scratchpad_dir);
        await cleanupSessionState(runtime.fs, base);
        return EMPTY_HOOK_OUTPUT;
      }
      case 'PostToolUse':
        return await handlePostToolUse(runtime, input);
      default:
        return EMPTY_HOOK_OUTPUT;
    }
  } catch {
    return EMPTY_HOOK_OUTPUT;
  }
}

/**
 * The marker is still consulted after `resetEpoch`: two events can reach the
 * same epoch (a `SessionStart` matcher firing alongside a resume).
 */
async function deliverSharedContract(
  runtime: Runtime,
  input: HookInput,
  baseDir: string,
  event: AdditionalContextEvent,
): Promise<unknown> {
  const contract = await readSharedOperatingContract(runtime.fs, runtime.pluginRoot);
  const key: DeliveryKey = {
    epoch: await currentEpoch(runtime.fs, runtime.ids, baseDir),
    agentKey: input.agent_id ?? 'main',
    kind: 'shared-contract',
    subject: contract.reference,
    contentHash: contract.contentHash,
  };
  if (await alreadyDelivered(runtime.fs, baseDir, key)) return EMPTY_HOOK_OUTPUT;
  await markDelivered(runtime.fs, baseDir, key);

  const output: AdditionalContextHookOutput = {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: [
        `AMBICODE operating contract (${contract.reference}, ${contract.contentHash}).`,
        'It governs every AMBICODE skill in this session. `ambicode prepare` cites it by',
        'reference instead of re-sending it; run it with --with-contract if this text is',
        'not in your context.',
        '',
        contract.content.trimEnd(),
      ].join('\n'),
    },
  };
  return output;
}

async function handlePostToolUse(runtime: Runtime, input: HookInput): Promise<unknown> {
  if (input.tool_name !== 'Edit' && input.tool_name !== 'Write') return EMPTY_HOOK_OUTPUT;
  const absoluteFilePath = input.tool_input?.file_path;
  if (absoluteFilePath === undefined) return EMPTY_HOOK_OUTPUT;

  const hookRuntime = await createRuntime({ ...runtime, cwd: input.cwd ?? runtime.cwd });

  const repository = await openRepository(hookRuntime).catch(() => null);
  if (repository === null) return EMPTY_HOOK_OUTPUT;

  const config = await loadConfig(hookRuntime.fs, repository.repositoryRoot)
    .then((loaded) => loaded.config)
    .catch((): AmbicodeConfig | null => null);
  if (config === null || !config.authoring.editReminders) return EMPTY_HOOK_OUTPUT;

  const workspace = { runtime: hookRuntime, git: repository.git, repositoryRoot: repository.repositoryRoot, config, configPath: '' };
  // Realpath-aware: a lexical `path.relative` reports `../../..` when the
  // repository is reached through a symlinked prefix, as macOS `/tmp` is.
  const relative = await toRepositoryRelative(workspace, absoluteFilePath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return EMPTY_HOOK_OUTPUT;
  }

  const project = projectForPath(config, relative);
  if (project === null) return EMPTY_HOOK_OUTPUT;

  const policy = await resolvePolicyFor({ workspace, project, activity: 'task', paths: [relative] }).catch(() => null);
  if (policy === null) return EMPTY_HOOK_OUTPUT;

  const candidates = policy.rules.filter((rule) => rule.remindOnEdit);
  if (candidates.length === 0) return EMPTY_HOOK_OUTPUT;

  const base = hookStateBaseDir(hookRuntime.fs, input.session_id, input.scratchpad_dir);
  const epoch = await currentEpoch(hookRuntime.fs, hookRuntime.ids, base);
  const agentKey = input.agent_id ?? 'main';

  const undelivered: ResolvedRule[] = [];
  for (const rule of candidates) {
    const key: DeliveryKey = {
      epoch,
      agentKey,
      kind: 'edit-reminder',
      subject: `${relative}::${rule.qualifiedId}`,
      contentHash: ruleContentHash(rule),
    };
    if (await alreadyDelivered(hookRuntime.fs, base, key)) continue;
    undelivered.push(rule);
    await markDelivered(hookRuntime.fs, base, key);
  }

  if (undelivered.length === 0) return EMPTY_HOOK_OUTPUT;
  return buildOutput(relative, undelivered);
}

function ruleContentHash(rule: ResolvedRule): string {
  return contentHash(
    JSON.stringify({
      id: rule.qualifiedId,
      category: rule.category,
      instruction: rule.instruction,
      check: rule.check,
    }),
  );
}

function buildOutput(relativePath: string, rules: readonly ResolvedRule[]): PostToolUseHookOutput {
  const lines = [
    `AMBICODE edit reminder for ${relativePath}.`,
    'This is a reminder applied on your NEXT model request, not proof that the edit you just made complied — verify it yourself.',
    '',
  ];
  for (const rule of rules) {
    lines.push(
      `- [${rule.qualifiedId}] (${rule.authority}, ${rule.category}) — ${rule.instruction}`,
      `  check: ${rule.check.explanation}`,
      `  source: ${rule.packReference} (${rule.sourceLocation})`,
      `  content: ${ruleContentHash(rule)}`,
      '',
    );
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: lines.join('\n').trimEnd(),
    },
  };
}
