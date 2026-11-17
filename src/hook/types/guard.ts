export interface GuardInput {
  hook_event_name?: string;
  session_id?: unknown;
  cwd?: unknown;
  scratchpad_dir?: unknown;
  tool_name?: string;
  /** Present for a subagent's tool call: the agent's name, e.g. `ambicode:reviewer`. */
  agent_type?: unknown;
  tool_input?: { command?: unknown; file_path?: unknown; notebook_path?: unknown; [field: string]: unknown };
}

/** Bounded reads of session state. */
export interface GuardState {
  /** The marker in the scratchpad, else in the temporary-directory fallback the hook state uses when the host gives no scratchpad. */
  headless(scratchpadDir: string | null, sessionId: string | null): boolean;
}

// Equal to markers.ts HOOK_STATE_DIR_NAME (tested); importing it would bundle node:path and node:crypto.
export const GUARD_STATE_DIR_NAME = 'ambicode-hook-state';

// Equal to active-route.ts HEADLESS_FILE: the guard cannot find the repository to scan for the session's route, so a live headless route leaves this marker.
export const HEADLESS_FILE = 'headless';
