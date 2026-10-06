// Claude Code hook support. guard/guard.ts is deliberately not re-exported: it is the guard bundle's entry
// and runs on import (reads stdin, prints a decision), so it is only ever built or spawned.

// guard/: the PreToolUse decision table and its bounded reads of session state and task ledgers (node:fs only).
/** guardDecision(input, pluginRoot?, state?, platform?) — the PreToolUse Decision for one tool call; pure apart from the injected state. */
export { guardDecision } from './guard/guard-core.ts';
export type { ActiveRoute, GuardInput, GuardState } from './types/guard.ts';
export { fsGuardState } from './guard/guard-state.ts';
export { ACTIVE_ROUTE_FILE, GUARD_LEDGER_FILE, GUARD_STATE_DIR_NAME, LEDGER_LIMIT } from './types/guard.ts';

// shell/: structural parsing of a Bash command into segments, write targets and directory scopes.
/** parseCommand(command, options?) — parses a Bash command into Segments (writes, directory scopes); the last is `unparsed` when not analysed. */
export { parseCommand } from './shell/command-parser.ts';
export type { Directories, ParseOptions, Segment, WriteTarget } from './shell/command-parser.ts';

// events/: the CLI-side hook dispatcher (SessionStart, UserPromptSubmit, PostToolUse, …) and the `prepare` runs it triggers.
/** defaultHookDeps(runtime) — the production HookDeps (routes, engine, pointer) built over a Runtime. */
export { defaultHookDeps } from './events/run-hook.ts';
/** runHook(runtime, rawStdin, injected?) — dispatches one hook event from its stdin JSON and returns the output object; never blocks a finished tool call. */
export { runHook } from './events/run-hook.ts';
export { MAX_HOOK_INPUT_BYTES } from '#types/hook';
export type { HookDeps } from '#types/hook';
/** launchRoute(runtime, input, deps) — on `/ambicode:<skill> …` starts the shipped route and returns its first step as context, else null. */
export { launchRoute } from './events/prompt-launch.ts';
/** reinjectRoute(runtime, input, deps) — redelivers the route step once after a new epoch (resume, compaction); null otherwise. */
export { reinjectRoute } from './events/prompt-launch.ts';
/** answerGates(runtime, input, deps, platform?) — after AskUserQuestion records the answers against printed gates and advances; returns context or null. */
export { answerGates } from './events/gate-answer.ts';
/** redBeforeGreen(entries, key) — true when a failing check precedes the key's first green one in the ledger. */
export { redBeforeGreen } from './events/stop-check.ts';
/** stopCheck(runtime, input, deps, options?) — evaluates Stop's conditions and returns the single block output they may cause, or null. */
export { stopCheck } from './events/stop-check.ts';
export { ANSWER_CONTEXT, ASK_BINDING, PLATFORM } from '#types/platform/claude';
/** prepareForSlashCommand(runtime, input) — for a `/ambicode:<skill>` prompt runs `prepare` and returns the PostToolUse output carrying its context. */
export { prepareForSlashCommand } from './events/prepare-on-skill.ts';

// session/: per-session delivery state (epoch and once-per-epoch markers), kept outside the product repository.
/** cleanupSessionState(fs, baseDir) — removes a session's delivery markers and epoch state. */
export { cleanupSessionState } from './session/markers.ts';
/** currentEpoch(fs, ids, baseDir) — the session's current epoch id, created on first use. */
export { currentEpoch } from './session/markers.ts';
/** deliverOnce(fs, baseDir, key) — records a delivery for the epoch; true when this call recorded it, false when already recorded. */
export { deliverOnce } from './session/markers.ts';
/** hookStateBaseDir(fs, sessionId, scratchpadDir?) — the directory holding a session's hook state, outside the product repository. */
export { hookStateBaseDir } from './session/markers.ts';
/** resetEpoch(fs, ids, baseDir) — starts a new epoch, invalidating all delivery markers. */
export { resetEpoch } from './session/markers.ts';
export { HOOK_STATE_DIR_NAME } from './types/session.ts';
export type { DeliveryKey } from './types/session.ts';
