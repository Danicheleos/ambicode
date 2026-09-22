import { z } from 'zod';

/**
 * The one central, bounded contract for a Claude Code hook invocation's
 * stdin JSON (doc 04 P2.4 correction G3). `looseObject` because the real
 * payload carries many more fields this hook never needs; only the ones it
 * actually reads are validated, and anything malformed or missing among
 * them makes the hook a silent no-op (correction G5/G7) rather than a
 * thrown error a caller would see as a broken edit.
 */
export const HookInput = z.looseObject({
  hook_event_name: z.string().min(1),
  session_id: z.string().min(1),
  /** Present for a subagent's tool call; absent on the main thread (doc 04 P2.4 correction H1/H2). */
  agent_id: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  /** A per-session scratchpad directory, when the host provides one (correction H2). */
  scratchpad_dir: z.string().min(1).optional(),
  tool_name: z.string().min(1).optional(),
  tool_input: z
    .looseObject({
      file_path: z.string().min(1).optional(),
    })
    .optional(),
});
export type HookInput = z.infer<typeof HookInput>;

/**
 * Events whose response may carry `hookSpecificOutput.additionalContext`.
 *
 * This is not the list of events a hook can subscribe to — it is the narrower
 * list Claude Code's output schema accepts, and returning anything else is a
 * hard validation failure the user sees, not a silent no-op. `PostCompact` is
 * a subscribable event with **no** output variant: it can reset this hook's
 * own state, but it cannot put text into the model's context. Verified against
 * the schema in Claude Code 2.1.278.
 */
export const ADDITIONAL_CONTEXT_EVENTS = ['PostToolUse', 'SessionStart', 'UserPromptSubmit'] as const;
export type AdditionalContextEvent = (typeof ADDITIONAL_CONTEXT_EVENTS)[number];

/**
 * The exact contract for injecting model-visible context (doc 04 P2.4
 * correction G6). `PostToolUse` carries edit reminders; `SessionStart` and the
 * first `UserPromptSubmit` of an epoch carry the shared operating contract,
 * which is why `ambicode prepare` no longer re-sends its text on every call
 * (R2 change 2). The event name is echoed back because the host matches the
 * response to the event it dispatched.
 */
export interface AdditionalContextHookOutput<Event extends AdditionalContextEvent = AdditionalContextEvent> {
  hookSpecificOutput: {
    hookEventName: Event;
    additionalContext: string;
  };
}

export type PostToolUseHookOutput = AdditionalContextHookOutput<'PostToolUse'>;

/** Every other event, and every silent no-op path, returns exactly this. */
export const EMPTY_HOOK_OUTPUT: Record<string, never> = {};
