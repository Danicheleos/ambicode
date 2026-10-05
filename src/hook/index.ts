// Claude Code hook support. guard/guard.ts is deliberately not re-exported: it is the guard bundle's entry
// and runs on import (reads stdin, prints a decision), so it is only ever built or spawned.

// guard/: the PreToolUse decision table and its bounded reads of session state and task ledgers (node:fs only).
export { guardDecision } from './guard/guard-core.ts';
export type { ActiveRoute, GuardInput, GuardState } from './guard/guard-core.ts';
export { ACTIVE_ROUTE_FILE, fsGuardState, GUARD_LEDGER_FILE, GUARD_STATE_DIR_NAME, LEDGER_LIMIT } from './guard/guard-state.ts';

// shell/: structural parsing of a Bash command into segments, write targets and directory scopes.
export { parseCommand } from './shell/command-parser.ts';
export type { Directories, ParseOptions, Segment, WriteTarget } from './shell/command-parser.ts';

// events/: the CLI-side hook dispatcher (SessionStart, UserPromptSubmit, PostToolUse, …) and the `prepare` runs it triggers.
export { MAX_HOOK_INPUT_BYTES, runHook } from './events/run-hook.ts';
export { prepareForSkill, prepareForSlashCommand, prepareForTicket } from './events/prepare-on-skill.ts';

// session/: per-session delivery state (epoch and once-per-epoch markers), kept outside the product repository.
export {
  cleanupSessionState,
  currentEpoch,
  deliverOnce,
  HOOK_STATE_DIR_NAME,
  hookStateBaseDir,
  resetEpoch,
} from './session/markers.ts';
export type { DeliveryKey } from './session/markers.ts';
