import type { GuardState, ToolTurnsInput } from '../types/guard.ts';

// Import-free like guard-core: it runs in the guard bundle after every tool call (see guard.ts).

export const toolTurnsText = (count: number): string =>
  `AMBICODE: ${count} tool turns in this answer. If what the request assumes is not in the code, say so and answer from what exists; otherwise answer from what you have read.`;

/** Assistant messages with a tool call since the last prompt, each as its tool call ids in order. */
export function toolTurns(transcript: string): string[][] {
  const turns = new Map<string, string[]>();
  for (const line of transcript.split('\n')) {
    if (line.trim() === '') continue;
    let event: { type?: string; isMeta?: boolean; isSidechain?: boolean; message?: { id?: string; content?: unknown } };
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.isSidechain === true) continue;
    const content = event.message?.content;
    if (event.type === 'user' && event.isMeta !== true && !(Array.isArray(content) && content.some((block) => block?.type === 'tool_result'))) turns.clear();
    if (event.type !== 'assistant' || !Array.isArray(content)) continue;
    const ids = content.filter((block) => block?.type === 'tool_use' && typeof block.id === 'string').map((block) => block.id as string);
    if (ids.length === 0) continue;
    const key = event.message?.id ?? ids[0]!;
    turns.set(key, [...(turns.get(key) ?? []), ...ids]);
  }
  return [...turns.values()];
}

/**
 * Once per answer, statelessly: the notice goes out on the first tool call of the turn that reaches the route's
 * `toolTurns`; later turns stay silent. Parallel calls of a turn not yet in the transcript may each give it once.
 */
export function toolTurnsNotice(input: ToolTurnsInput, state: GuardState): Record<string, unknown> {
  if (input.hook_event_name !== 'PostToolUse' || input.agent_id !== undefined) return {};
  const scratchpad = typeof input.scratchpad_dir === 'string' && input.scratchpad_dir !== '' ? input.scratchpad_dir : null;
  const session = typeof input.session_id === 'string' && input.session_id !== '' ? input.session_id : null;
  const route = scratchpad !== null ? state.activeRoute(scratchpad) : session !== null ? (state.sessionRoute?.(session) ?? null) : null;
  const budget = route?.toolTurns;
  if (budget === undefined || typeof input.transcript_path !== 'string' || typeof input.tool_use_id !== 'string') return {};
  const transcript = state.transcriptTail?.(input.transcript_path) ?? null;
  if (transcript === null) return {};
  // A turn of parallel calls may reach the transcript only after its calls ran: a call not yet written opens the next turn.
  const turns = toolTurns(transcript);
  const at = turns.findIndex((ids) => ids.includes(input.tool_use_id as string));
  const fires = at < 0 ? turns.length === budget - 1 : at === budget - 1 && turns[at]![0] === input.tool_use_id;
  if (!fires) return {};
  return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: toolTurnsText(budget) } };
}
