import { z } from 'zod';
import type { Engine, RouteRegistry } from './harness.ts';

/**
 * `looseObject`: the real payload has many fields this hook never reads. A malformed
 * or missing read field makes the hook a silent no-op, never a thrown error.
 */
export const HookInput = z.looseObject({
  hook_event_name: z.string().min(1),
  session_id: z.string().min(1),
  /** Present for a subagent's tool call; absent on the main thread. */
  agent_id: z.string().min(1).optional(),
  /** SubagentStop: the subagent's type and its transcript, where its final report is read. */
  agent_type: z.string().min(1).optional(),
  agent_transcript_path: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  scratchpad_dir: z.string().min(1).optional(),
  tool_name: z.string().min(1).optional(),
  /** The text a `UserPromptSubmit` event carries. */
  prompt: z.string().optional(),
  /** What an MCP read tool returned; its shape is the server's, so nothing is assumed of it. */
  tool_response: z.unknown().optional(),
  tool_input: z
    .looseObject({
      file_path: z.string().min(1).optional(),
      skill: z.string().min(1).optional(),
      args: z.string().optional(),
      /** AskUserQuestion: the questions the model put, each with its option labels. */
      questions: z.array(z.looseObject({ question: z.string(), options: z.array(z.looseObject({ label: z.string() })).optional() })).optional(),
    })
    .optional(),
  /** Stop: the text of the last assistant message; Claude Code sends it so no transcript is read. */
  last_assistant_message: z.string().optional(),
  stop_hook_active: z.boolean().optional(),
});
export type HookInput = z.infer<typeof HookInput>;

/**
 * Narrower than the subscribable events: Claude Code rejects `additionalContext` on any
 * other event with a user-visible validation failure (e.g. `PostCompact`). Checked on 2.1.278.
 */
const ADDITIONAL_CONTEXT_EVENTS = ['PostToolUse', 'SessionStart', 'UserPromptSubmit'] as const;
type AdditionalContextEvent = (typeof ADDITIONAL_CONTEXT_EVENTS)[number];

export interface AdditionalContextHookOutput<Event extends AdditionalContextEvent = AdditionalContextEvent> {
  hookSpecificOutput: {
    hookEventName: Event;
    additionalContext: string;
  };
}

export const EMPTY_HOOK_OUTPUT: Record<string, never> = {};

/** What Stop may say. Only `decision` and `reason` are claimed to work (03-K7). */
export interface StopHookOutput {
  decision: 'block';
  reason: string;
}

/** AskUserQuestion's `tool_response` as observed: `answers` maps each question text to the chosen label or free text; `questions` and `annotations` are ignored. */
export const AskUserQuestionResponse = z.looseObject({ answers: z.record(z.string(), z.string()).optional() });

export interface RouteHookDeps { engine: Engine; routes: RouteRegistry }

/** The route registry and the engine are built only by an event that needs them. */
export interface HookDeps {
  /** The engine is built on the session's repository root, or on the process cwd when the session has none. */
  load(repositoryRoot: string | null): Promise<RouteHookDeps>;
}

export const MAX_HOOK_INPUT_BYTES = 1_048_576;
