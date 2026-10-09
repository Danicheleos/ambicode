import type { LedgerEntry } from '#types/modules/evidence';

export interface GuardInput {
  hook_event_name?: string;
  session_id?: unknown;
  cwd?: unknown;
  scratchpad_dir?: unknown;
  tool_name?: string;
  tool_input?: { command?: unknown; file_path?: unknown; notebook_path?: unknown; offset?: unknown; limit?: unknown };
}

/** The session's cached pointer to its active route (30 §2). A pointer alone never authorizes a write. */
export interface ActiveRoute {
  task: string;
  skill: string;
  headless?: boolean;
}

/** Bounded reads of session state and a task ledger; `null` when absent, too large or unreadable. */
export interface GuardState {
  activeRoute(scratchpadDir: string): ActiveRoute | null;
  ledger(taskDirectory: string): LedgerEntry[] | null;
  /** A regular file exists at this absolute path; absent in a state that cannot tell, which leaves reads alone. */
  file?(path: string): boolean;
}

// Equal to markers.ts HOOK_STATE_DIR_NAME and ledger.ts LEDGER_FILE (tested); importing either would bundle node:path and node:crypto.
export const GUARD_STATE_DIR_NAME = 'ambicode-hook-state';

export const ACTIVE_ROUTE_FILE = 'active-route';

export const GUARD_LEDGER_FILE = 'ledger.jsonl';

// The 1 MiB ledger warning (01-contracts §1). Built guard, 20-spawn medians: 34-38 ms small, 40-43 ms at 1 MiB of
// long records, 45-50 ms at 1 MiB of short ones, 53-57 ms at 2 MiB of short ones against 33 §7's 50 ms; a larger
// ledger denies the plan-body write instead.
export const LEDGER_LIMIT = 1024 * 1024;
