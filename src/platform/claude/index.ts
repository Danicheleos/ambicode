// Claude Code session state: per-session delivery state (epoch and once-per-epoch markers), kept outside the product repository.

/** cleanupSessionState(fs, baseDir) — removes a session's delivery markers and epoch state. */
export { cleanupSessionState } from './hook-state.ts';
/** currentEpoch(fs, ids, baseDir) — the session's current epoch id, created on first use. */
export { currentEpoch } from './hook-state.ts';
/** deliverOnce(fs, baseDir, key) — records a delivery for the epoch; true when this call recorded it, false when already recorded. */
export { deliverOnce } from './hook-state.ts';
/** hookStateBaseDir(fs, sessionId, scratchpadDir?) — the directory holding a session's hook state, outside the product repository. */
export { hookStateBaseDir } from './hook-state.ts';
/** readStopCursor(fs, baseDir, routeId) — the ledger entry count the previous Stop saw for a route; 0 before any. */
export { readStopCursor } from './hook-state.ts';
/** writeStopCursor(fs, baseDir, routeId, count) — records the ledger entry count this Stop saw for a route. */
export { writeStopCursor } from './hook-state.ts';
/** markSessionEnded(fs, sessionId) — marks a session as ended; the mark outlives cleanupSessionState. */
export { markSessionEnded } from './hook-state.ts';
/** clearSessionEnded(fs, sessionId) — removes a session's ended mark. */
export { clearSessionEnded } from './hook-state.ts';
/** sessionEnded(fs, sessionId) — whether the session carries an ended mark. */
export { sessionEnded } from './hook-state.ts';
/** anySessionEnded(fs) — whether any session carries an ended mark; one directory read. */
export { anySessionEnded } from './hook-state.ts';
/** resetEpoch(fs, ids, baseDir) — starts a new epoch, invalidating all delivery markers. */
export { resetEpoch } from './hook-state.ts';
export { HOOK_STATE_DIR_NAME } from '#types/platform/claude';
export type { DeliveryKey } from '#types/platform/claude';
