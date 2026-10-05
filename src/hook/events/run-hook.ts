import path from 'node:path';
import {
  createRuntime,
  openRepository,
  projectForPath,
  resolvePolicyFor,
  toRepositoryRelative,
  type Runtime,
} from '../../composition/root.ts';
import { loadConfig } from '../../config/load.ts';
import type { AmbicodeConfig } from '../../contracts/config.ts';
import type { ResolvedRule } from '../../contracts/policy.ts';
import {
  EMPTY_HOOK_OUTPUT,
  HookInput,
  type AdditionalContextEvent,
  type AdditionalContextHookOutput,
  type PostToolUseHookOutput,
} from '../../contracts/hook.ts';
import { prepareForSlashCommand } from './prepare-on-skill.ts';
import { askedKeys } from '../../requirements/envelope.ts';
import { captureRequirement } from '../../requirements/capture.ts';
import { fsActiveRoutePointer, resolveActiveRoute, type ActiveRoutePointer } from '../../route/active-route.ts';
import { openRouteView } from '../../route/context.ts';
import { createEngine } from '../../route/engine.ts';
import type { RouteArgs } from '../../route/flags.ts';
import { defaultHandlers, handlerRegistry } from '../../route/handlers.ts';
import { loadRouteRegistry } from '../../route/routes.ts';
import { findSessionRepository } from '../../composition/session-repository.ts';
import { withLedgerLock } from '../../task/ledger-lock.ts';
import { taskDirFor } from '../../task/task-dir.ts';
import { answerGates } from './gate-answer.ts';
import { launchRoute, reinjectRoute, type RouteHookDeps } from './prompt-launch.ts';
import { stopCheck } from './stop-check.ts';
import { readSessionContract } from '../../policy/shared-contract.ts';
import { contentHash } from '../../util/hash.ts';
import { rebindSession } from './rebind.ts';
import {
  clearSessionEnded,
  cleanupSessionState,
  currentEpoch,
  deliverOnce,
  hookStateBaseDir,
  markSessionEnded,
  resetEpoch,
  type DeliveryKey,
} from '../session/markers.ts';

export const MAX_HOOK_INPUT_BYTES = 1_048_576;

/** The pointer is cheap to open; the route registry and the engine are built only by an event that needs them. */
export interface HookDeps {
  pointer: ActiveRoutePointer;
  load(): Promise<RouteHookDeps>;
}

export function defaultHookDeps(runtime: Runtime): HookDeps {
  const pointer = fsActiveRoutePointer(runtime.fs);
  let loaded: Promise<RouteHookDeps> | null = null;
  return {
    pointer,
    load: () =>
      (loaded ??= loadRouteRegistry(runtime.pluginRoot, runtime.fs).then((routes) => ({
        routes,
        pointer,
        engine: createEngine({ runtime, routes, handlers: handlerRegistry(defaultHandlers()), pointer }),
      }))),
  };
}

const stateDir = (runtime: Runtime, input: HookInput): string => hookStateBaseDir(runtime.fs, input.session_id, input.scratchpad_dir);

/**
 * Never throws: any failure is a silent no-op, because a hook is advisory and
 * must never block or alter the tool call that already happened.
 */
export async function runHook(runtime: Runtime, rawStdin: string, injected?: HookDeps): Promise<unknown> {
  const deps = injected ?? defaultHookDeps(runtime);
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
        const base = stateDir(runtime, input);
        await resetEpoch(runtime.fs, runtime.ids, base);
        await clearSessionEnded(runtime.fs, input.session_id);
        if (input['source'] !== 'startup') await rebindSession(runtime, input, deps.pointer).catch(() => false);
        return await deliverSharedContract(runtime, input, base, 'SessionStart');
      }
      case 'PostCompact': {
        // A compaction invalidates earlier deliveries, but this event has no
        // `hookSpecificOutput` variant in Claude Code's schema (returning one fails
        // validation), so the next `UserPromptSubmit` delivers the contract instead.
        const base = stateDir(runtime, input);
        await resetEpoch(runtime.fs, runtime.ids, base);
        await rebindSession(runtime, input, deps.pointer).catch(() => false);
        return EMPTY_HOOK_OUTPUT;
      }
      case 'UserPromptSubmit': {
        const base = stateDir(runtime, input);
        const contract = (await deliverSharedContract(runtime, input, base, 'UserPromptSubmit')) as {
          hookSpecificOutput?: { additionalContext: string };
        };
        const routed = await promptContext(runtime, input, deps);
        if (routed === null) return contract;
        const context = [contract.hookSpecificOutput?.additionalContext, routed].filter(Boolean).join('\n\n');
        return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } };
      }
      case 'Stop':
        return (await stopCheck(runtime, input, await deps.load())) ?? EMPTY_HOOK_OUTPUT;
      case 'SessionEnd': {
        const base = stateDir(runtime, input);
        if ((await deps.pointer.read(input.session_id, input.scratchpad_dir)) !== null) await markSessionEnded(runtime.fs, input.session_id);
        await cleanupSessionState(runtime.fs, base);
        return EMPTY_HOOK_OUTPUT;
      }
      case 'PostToolUse':
        return await handlePostToolUse(runtime, input, deps);
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
  const contract = await readSessionContract(runtime.fs, runtime.pluginRoot);
  const key: DeliveryKey = {
    epoch: await currentEpoch(runtime.fs, runtime.ids, baseDir),
    agentKey: input.agent_id ?? 'main',
    kind: 'shared-contract',
    subject: contract.reference,
    contentHash: contract.contentHash,
  };
  if (!(await deliverOnce(runtime.fs, baseDir, key))) return EMPTY_HOOK_OUTPUT;

  const output: AdditionalContextHookOutput = {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: [
        `AMBICODE operating contract (${contract.reference}, ${contract.contentHash}). It governs every AMBICODE skill in this session.`,
        '',
        contract.content.trimEnd(),
      ].join('\n'),
    },
  };
  return output;
}

/** A launch first, then the plan/task slash command that still prepares, then re-injection of the active route's step. */
async function promptContext(runtime: Runtime, input: HookInput, deps: HookDeps): Promise<string | null> {
  const prompt = (input.prompt ?? '').trim();
  if (/^\/ambicode:\w+/.test(prompt)) {
    const launched = await launchRoute(runtime, input, await deps.load());
    if (launched !== null) return launched;
    return (await prepareForSlashCommand(runtime, input))?.hookSpecificOutput.additionalContext ?? null;
  }
  if (input.agent_id !== undefined || (await deps.pointer.read(input.session_id, input.scratchpad_dir)) === null) return null;
  return reinjectRoute(runtime, input, await deps.load());
}

/** The requirement an MCP read returned, recorded for the active route; a call with no route costs one file read (03-H6). */
async function captureForRoute(runtime: Runtime, input: HookInput, deps: HookDeps): Promise<void> {
  if (input.agent_id !== undefined || (await deps.pointer.read(input.session_id, input.scratchpad_dir)) === null) return;
  const found = await findSessionRepository(runtime, input.cwd ?? runtime.cwd);
  if (typeof found === 'string') return;
  const active = await resolveActiveRoute(runtime.fs, deps.pointer, { repositoryRoot: found.repositoryRoot, session: input.session_id, scratchpad: input.scratchpad_dir });
  if (active === null) return;
  const mcpServer = await loadConfig(runtime.fs, found.repositoryRoot).then((loaded) => loaded.config.requirements.mcpServer).catch(() => null);
  const routeRuntime = await createRuntime({ ...runtime, cwd: found.repositoryRoot });
  const { routes } = await deps.load();
  const view = await openRouteView(routeRuntime, routes, active.task, active.owner);
  if (view === null) return;
  const dir = taskDirFor(found.repositoryRoot, active.task);
  await withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), input.session_id, async (ledger) => {
    const read = await ledger.read();
    const head = read.state === 'ok' ? read.entries.find((entry) => entry.id === view.routeId) : undefined;
    await captureRequirement(input, { runtime: routeRuntime, dir, ledger, view, mcpServer, asked: askedKeys((head?.['args'] ?? { requirements: [], text: '' }) as Pick<RouteArgs, 'requirements' | 'text'>) });
  });
}

async function handlePostToolUse(runtime: Runtime, input: HookInput, deps: HookDeps): Promise<unknown> {
  if (input.tool_name === 'AskUserQuestion') {
    const context = await answerGates(runtime, input, await deps.load());
    return context === null ? EMPTY_HOOK_OUTPUT : { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context } };
  }
  if (input.tool_name?.startsWith('mcp__')) {
    await captureForRoute(runtime, input, deps);
    return EMPTY_HOOK_OUTPUT;
  }
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

  const base = stateDir(hookRuntime, input);
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
    if (await deliverOnce(hookRuntime.fs, base, key)) undelivered.push(rule);
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
