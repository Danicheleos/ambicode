import { z } from 'zod';

/**
 * `looseObject`: the real payload has many fields this hook never reads. A malformed
 * or missing read field makes the hook a silent no-op, never a thrown error.
 */
export const HookInput = z.looseObject({
  hook_event_name: z.string().min(1),
  session_id: z.string().min(1),
  /** Present for a subagent's tool call; absent on the main thread. */
  agent_id: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  scratchpad_dir: z.string().min(1).optional(),
  tool_name: z.string().min(1).optional(),
  tool_input: z
    .looseObject({
      file_path: z.string().min(1).optional(),
      command: z.string().optional(),
    })
    .optional(),
  tool_response: z.unknown().optional(),
});
export type HookInput = z.infer<typeof HookInput>;

/**
 * Narrower than the subscribable events: Claude Code rejects `additionalContext` on any
 * other event with a user-visible validation failure (e.g. `PostCompact`). Checked on 2.1.278.
 */
export const ADDITIONAL_CONTEXT_EVENTS = ['PostToolUse', 'SessionStart', 'UserPromptSubmit'] as const;
export type AdditionalContextEvent = (typeof ADDITIONAL_CONTEXT_EVENTS)[number];

export interface AdditionalContextHookOutput<Event extends AdditionalContextEvent = AdditionalContextEvent> {
  hookSpecificOutput: {
    hookEventName: Event;
    additionalContext: string;
  };
}

export type PostToolUseHookOutput = AdditionalContextHookOutput<'PostToolUse'>;

export const EMPTY_HOOK_OUTPUT: Record<string, never> = {};
