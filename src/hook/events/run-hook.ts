import { dirKindFor } from '#types/defaults';
import { createRuntime } from '#composition/root';
import { EMPTY_HOOK_OUTPUT, HookInput, type AdditionalContextHookOutput, type RouteHookDeps, type HookDeps } from '#types/hook';
import { askedKeys } from '#modules/requirements/envelope/envelope';
import { captureRequirement } from '#modules/requirements/capture/capture';
import { captureMrDiff } from '#modules/review/snapshot/mr-capture';
import { fsActiveRoutePointer, resolveActiveRoute } from '#harness/session/active-route';
import { openRouteView } from '#harness/engine/context';
import { createApp } from '#composition/app';
import { findSessionRepository } from '#platform/git/session-repository';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import { answerGates } from './gate-answer.ts';
import { launchRoute, reinjectRoute } from './prompt-launch.ts';
import { stopCheck } from './stop-check.ts';
import { implementerReturned } from './implementer-return.ts';
import { recordReviewerCall } from './review-record.ts';
import { loadConfig } from '#modules/config/load';
import { dropIgnoredGlobResults, type GlobResponse } from '#modules/search/glob-ignored';
import { readSessionContract } from '#modules/policy/packs/shared-contract';
import { cleanupSessionState, deliverOnce, hookStateBaseDir, resetDelivered } from '#platform/claude/hook-state';
import type { Runtime } from '#types/composition';
import type { RouteArgs } from '#types/harness';

export function defaultHookDeps(runtime: Runtime): HookDeps {
  const pointer = fsActiveRoutePointer(runtime.fs);
  let loaded: Promise<RouteHookDeps> | undefined;
  return {
    pointer,
    // The hook process cwd is wherever the session started, often above the repository; the engine reads config from `cwd`.
    load: (repositoryRoot) => {
      loaded ??= createRuntime({ ...runtime, cwd: repositoryRoot ?? runtime.cwd }).then(createApp).then(({ routes, engine }) => ({ routes, pointer, engine }));
      return loaded;
    },
  };
}

const loadFor = async (runtime: Runtime, deps: HookDeps, input: HookInput): Promise<RouteHookDeps> => {
  const found = await findSessionRepository(runtime, input.cwd ?? runtime.cwd);
  return deps.load(typeof found === 'string' ? null : found.repositoryRoot);
};

const stateDir = (runtime: Runtime, input: HookInput): string => hookStateBaseDir(runtime.fs, input.session_id, input.scratchpad_dir);

/**
 * Never throws: any failure is a no-op, because a hook is advisory and must never block or alter the tool call that
 * already happened. The reason goes to stderr, so a silent no-op leaves a trace.
 */
export async function runHook(runtime: Runtime, rawStdin: string, injected?: HookDeps): Promise<unknown> {
  const deps = injected ?? defaultHookDeps(runtime);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawStdin);
  } catch {
    process.stderr.write('ambicode hook: stdin is not JSON\n');
    return EMPTY_HOOK_OUTPUT;
  }
  const result = HookInput.safeParse(parsed);
  if (!result.success) {
    process.stderr.write(`ambicode hook: input rejected: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}\n`);
    return EMPTY_HOOK_OUTPUT;
  }
  const input = result.data;

  try {
    switch (input.hook_event_name) {
      case 'SessionStart': {
        const base = stateDir(runtime, input);
        await resetDelivered(runtime.fs, base);
        return EMPTY_HOOK_OUTPUT;
      }
      case 'PostCompact': {
        // A compaction invalidates earlier deliveries, but this event has no
        // `hookSpecificOutput` variant in Claude Code's schema (returning one fails
        // validation), so the next `UserPromptSubmit` delivers the contract instead.
        const base = stateDir(runtime, input);
        await resetDelivered(runtime.fs, base);
        return EMPTY_HOOK_OUTPUT;
      }
      case 'UserPromptSubmit': {
        const base = stateDir(runtime, input);
        const routed = await promptContext(runtime, input, deps);
        if (routed === null) return EMPTY_HOOK_OUTPUT;
        const contract = (await deliverSharedContract(runtime, input, base)) as {
          hookSpecificOutput?: { additionalContext: string };
        };
        const context = [contract.hookSpecificOutput?.additionalContext, routed].filter(Boolean).join('\n\n');
        return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } };
      }
      case 'Stop':
        return (await stopCheck(input, await loadFor(runtime, deps, input))) ?? EMPTY_HOOK_OUTPUT;
      case 'SessionEnd': {
        const base = stateDir(runtime, input);
        await cleanupSessionState(runtime.fs, base);
        return EMPTY_HOOK_OUTPUT;
      }
      case 'PostToolUse':
        return await handlePostToolUse(runtime, input, deps);
      default:
        return EMPTY_HOOK_OUTPUT;
    }
  } catch (error) {
    process.stderr.write(`ambicode hook ${input.hook_event_name}: ${error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 3).join(' | ') : String(error)}\n`);
    return EMPTY_HOOK_OUTPUT;
  }
}

async function deliverSharedContract(
  runtime: Runtime,
  input: HookInput,
  baseDir: string,
): Promise<unknown> {
  const contract = await readSessionContract(runtime.fs, runtime.pluginRoot);
  // Still consulted after a reset: two events can reach it together (a `SessionStart` matcher firing alongside a resume).
  if (!(await deliverOnce(runtime.fs, baseDir, `contract-${input.agent_id ?? 'main'}`, `${contract.reference}:${contract.contentHash}`))) return EMPTY_HOOK_OUTPUT;

  const output: AdditionalContextHookOutput = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: contract.content.trimEnd(),
    },
  };
  return output;
}

/** A route launch first, then re-injection of the active route's step. */
async function promptContext(runtime: Runtime, input: HookInput, deps: HookDeps): Promise<string | null> {
  const prompt = (input.prompt ?? '').trim();
  if (/^\/ambicode:\w+/.test(prompt)) {
    return launchRoute(runtime, input, await loadFor(runtime, deps, input));
  }
  if (input.agent_id !== undefined || (await deps.pointer.read(input.session_id, input.scratchpad_dir)) === null) return null;
  return reinjectRoute(runtime, input, await loadFor(runtime, deps, input));
}

/** The requirement an MCP read returned, recorded for the active route; a call with no route costs one file read (03-H6). */
async function captureForRoute(runtime: Runtime, input: HookInput, deps: HookDeps): Promise<void> {
  if (input.agent_id !== undefined || (await deps.pointer.read(input.session_id, input.scratchpad_dir)) === null) return;
  const found = await findSessionRepository(runtime, input.cwd ?? runtime.cwd);
  if (typeof found === 'string') return;
  const active = await resolveActiveRoute(runtime.fs, deps.pointer, { repositoryRoot: found.repositoryRoot, session: input.session_id, scratchpad: input.scratchpad_dir });
  if (active === null) return;
  const routeRuntime = await createRuntime({ ...runtime, cwd: found.repositoryRoot });
  const { routes } = await deps.load(found.repositoryRoot);
  const view = await openRouteView(routeRuntime, routes, active.task, active.owner);
  if (view === null) return;
  const dir = taskDirFor(found.repositoryRoot, active.task, '.', dirKindFor(active.skill));
  await withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), input.session_id, async (ledger) => {
    const read = await ledger.read();
    const head = read.state === 'ok' ? read.entries.find((entry) => entry.id === view.routeId) : undefined;
    const mrUrl = view.skill === 'review' ? ((head?.['args'] as { target?: { mr?: string | null } } | undefined)?.target?.mr ?? null) : null;
    await captureMrDiff(input, { runtime: routeRuntime, dir, ledger, routeId: view.routeId, mrUrl });
    await captureRequirement(input, { runtime: routeRuntime, dir, ledger, view, asked: askedKeys((head?.['args'] ?? { requirements: [], text: '' }) as Pick<RouteArgs, 'requirements' | 'text'>) });
  });
}

async function handlePostToolUse(runtime: Runtime, input: HookInput, deps: HookDeps): Promise<unknown> {
  if (input.tool_name === 'AskUserQuestion') {
    const context = await answerGates(runtime, input, await loadFor(runtime, deps, input));
    return context === null ? EMPTY_HOOK_OUTPUT : { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context } };
  }
  if (input.tool_name === 'Agent') {
    const context = (await recordReviewerCall(runtime, input, deps)) ?? (await implementerReturned(runtime, input, deps));
    return context === null ? EMPTY_HOOK_OUTPUT : { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context } };
  }
  if (input.tool_name === 'Glob') return await filterGlob(runtime, input);
  if (input.tool_name === 'WebFetch' || input.tool_name?.startsWith('mcp__')) {
    await captureForRoute(runtime, input, deps);
    return EMPTY_HOOK_OUTPUT;
  }
  return EMPTY_HOOK_OUTPUT;
}

async function filterGlob(runtime: Runtime, input: HookInput): Promise<unknown> {
  const response = input.tool_response as GlobResponse | undefined;
  if (!Array.isArray(response?.filenames)) return EMPTY_HOOK_OUTPUT;
  const found = await findSessionRepository(runtime, input.cwd ?? runtime.cwd);
  if (typeof found === 'string') return EMPTY_HOOK_OUTPUT;
  // Git reports the real root; macOS reaches /tmp and /var through symlinks, so a lexical relative path would climb out.
  const cwd = await runtime.fs.realpath(input.cwd ?? runtime.cwd);
  const { config } = await loadConfig(runtime.fs, found.repositoryRoot);
  const toolInput = input.tool_input as { pattern?: unknown; path?: unknown } | undefined;
  const filtered = dropIgnoredGlobResults(response, {
    cwd,
    repositoryRoot: await runtime.fs.realpath(found.repositoryRoot),
    projects: config.projects,
    ...(typeof toolInput?.pattern === 'string' ? { pattern: toolInput.pattern } : {}),
    ...(typeof toolInput?.path === 'string' ? { searchPath: toolInput.path } : {}),
  });
  return filtered === null ? EMPTY_HOOK_OUTPUT : { hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: filtered } };
}
