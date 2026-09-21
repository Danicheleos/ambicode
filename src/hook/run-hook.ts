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
import { EMPTY_HOOK_OUTPUT, HookInput, type PostToolUseHookOutput } from '../contracts/hook.ts';
import { contentHash } from '../util/hash.ts';
import {
  alreadyDelivered,
  cleanupSessionState,
  currentEpoch,
  hookStateBaseDir,
  markDelivered,
  resetEpoch,
  type ReminderKey,
} from './markers.ts';

/** A bounded read: a malformed or oversized hook payload never hangs or crashes the edit. */
const MAX_HOOK_INPUT_BYTES = 1_048_576;

export async function readBoundedStdin(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_HOOK_INPUT_BYTES) return '';
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * The packaged plugin's one hook entry point (doc 04 P2.4 correction G):
 * dispatches on `hook_event_name` and never throws — any failure to parse,
 * resolve, or apply policy is a silent no-op, because a hook is advisory and
 * must never block, alter, or comment on the tool call that already
 * happened (correction G7). `PostToolUse` for `Edit`/`Write` is the only
 * branch that can produce visible output; every other branch only
 * maintains this hook's own owned, out-of-repository delivery state
 * (correction H3).
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
      case 'SessionStart':
      case 'PostCompact': {
        const base = hookStateBaseDir(runtime.fs, input.session_id, input.scratchpad_dir);
        await resetEpoch(runtime.fs, runtime.ids, base);
        return EMPTY_HOOK_OUTPUT;
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
    // Never let an internal failure surface as a broken edit (correction G7).
    return EMPTY_HOOK_OUTPUT;
  }
}

async function handlePostToolUse(runtime: Runtime, input: HookInput): Promise<unknown> {
  if (input.tool_name !== 'Edit' && input.tool_name !== 'Write') return EMPTY_HOOK_OUTPUT;
  const absoluteFilePath = input.tool_input?.file_path;
  if (absoluteFilePath === undefined) return EMPTY_HOOK_OUTPUT;

  const hookRuntime = await createRuntime({ ...runtime, cwd: input.cwd ?? runtime.cwd });

  const repository = await openRepository(hookRuntime).catch(() => null);
  if (repository === null) return EMPTY_HOOK_OUTPUT; // Not inside a git work tree.

  const config = await loadConfig(hookRuntime.fs, repository.repositoryRoot)
    .then((loaded) => loaded.config)
    .catch((): AmbicodeConfig | null => null);
  if (config === null || !config.authoring.editReminders) return EMPTY_HOOK_OUTPUT;

  const workspace = { runtime: hookRuntime, git: repository.git, repositoryRoot: repository.repositoryRoot, config, configPath: '' };
  // Realpath-aware, the same way every other AMBICODE path resolution is
  // (`toRepositoryRelative`): a lexical `path.relative` alone would report a
  // nonsense `../../..` path whenever the repository is reached through a
  // symlinked prefix, which on macOS is `/tmp` and `/var` themselves.
  const relative = await toRepositoryRelative(workspace, absoluteFilePath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return EMPTY_HOOK_OUTPUT; // Outside the repository.
  }

  const project = projectForPath(config, relative);
  if (project === null) return EMPTY_HOOK_OUTPUT; // Outside every configured project.

  const policy = await resolvePolicyFor({ workspace, project, activity: 'task', paths: [relative] }).catch(() => null);
  if (policy === null) return EMPTY_HOOK_OUTPUT;

  const candidates = policy.rules.filter((rule) => rule.remindOnEdit);
  if (candidates.length === 0) return EMPTY_HOOK_OUTPUT;

  const base = hookStateBaseDir(hookRuntime.fs, input.session_id, input.scratchpad_dir);
  const epoch = await currentEpoch(hookRuntime.fs, hookRuntime.ids, base);
  const agentKey = input.agent_id ?? 'main';

  const undelivered: ResolvedRule[] = [];
  for (const rule of candidates) {
    const key: ReminderKey = {
      epoch,
      agentKey,
      normalizedPath: relative,
      qualifiedRuleId: rule.qualifiedId,
      ruleContentHash: ruleContentHash(rule),
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
