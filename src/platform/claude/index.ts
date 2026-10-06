// Claude Code session state: per-session delivery state (epoch and once-per-epoch markers), kept outside the product repository.

/** cleanupSessionState(fs, baseDir) — removes a session's delivery markers and epoch state. */
export { cleanupSessionState } from './hook-state.ts';
/** currentEpoch(fs, ids, baseDir) — the session's current epoch id, created on first use. */
export { currentEpoch } from './hook-state.ts';
/** deliverOnce(fs, baseDir, key) — records a delivery for the epoch; true when this call recorded it, false when already recorded. */
export { deliverOnce } from './hook-state.ts';
/** hookStateBaseDir(fs, sessionId, scratchpadDir?) — the directory holding a session's hook state, outside the product repository. */
export { hookStateBaseDir } from './hook-state.ts';
/** resetEpoch(fs, ids, baseDir) — starts a new epoch, invalidating all delivery markers. */
export { resetEpoch } from './hook-state.ts';
export { HOOK_STATE_DIR_NAME } from '#types/platform/claude';
export type { DeliveryKey } from '#types/platform/claude';
