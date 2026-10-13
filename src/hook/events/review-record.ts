import { dirKindFor } from '#types/defaults';
import { AgentToolResponse, type HookInput, type HookDeps } from '#types/hook';
import { findSessionRepository } from '#platform/git/session-repository';
import { readLedger } from '#platform/ledger/ledger';
import { resolveActiveRoute } from '#harness/session/active-route';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import { pendingReview, REVIEWER_AGENT_TYPE } from '#modules/review/answer/captured';
import { recordReviewerAnswer, renderRecord, type RecordedReview } from '#skills/review/record-answer';
import { HOOK_LIMIT } from '#harness/engine/execute';
import { messageOf } from '#util/errors';
import type { Runtime } from '#types/composition';

/** Past the hook's cap the model sees only the start of the context, so the report gives way and the next step stays whole. */
function contextOf(recorded: RecordedReview, next?: string): string {
  const full = renderRecord({ ...recorded, ...(next === undefined ? {} : { next }) });
  if (full.length <= HOOK_LIMIT) return full;
  return renderRecord({ ...recorded, ...(next === undefined ? {} : { next }), report: `Review report: ${recorded.result.findings.length} findings; read it whole: ${recorded.reportPath}` });
}

const answerText = (input: HookInput): string => (AgentToolResponse.safeParse(input.tool_response).data?.content ?? []).map((part) => part.text ?? '').join('\n');

/**
 * PostToolUse on Agent: the reviewer subagent returned, so record its answer and hand the model the report and the next
 * step in this turn. A background launch has no answer yet (`async_launched`); SubagentStop captured it later, and the
 * fallback command in the step text records it. Null means this call is not a pending review's answer.
 */
export async function recordReviewerCall(runtime: Runtime, input: HookInput, deps: HookDeps): Promise<string | null> {
  if (input.agent_id !== undefined || input.tool_name !== 'Agent' || !REVIEWER_AGENT_TYPE.test(input.tool_input?.subagent_type ?? '')) return null;
  if (AgentToolResponse.safeParse(input.tool_response).data?.status !== 'completed') return null;
  const found = await findSessionRepository(runtime, input.cwd ?? runtime.cwd);
  if (typeof found === 'string') return null;
  const active = await resolveActiveRoute(runtime.fs, deps.pointer, { repositoryRoot: found.repositoryRoot, session: input.session_id, scratchpad: input.scratchpad_dir });
  if (active === null) return null;
  if (pendingReview(await readLedger(runtime.fs, taskDirFor(found.repositoryRoot, active.task, '.', dirKindFor(active.skill)).root), null) === undefined) return null;

  const cli = `node "${runtime.pluginRoot}/scripts/ambicode.mjs"`;
  let recorded;
  try {
    recorded = await recordReviewerAnswer({ ...runtime, cwd: found.repositoryRoot }, { task: active.task, wanted: null, fallback: async () => answerText(input) });
  } catch (error) {
    return `[ambicode] The reviewer's answer was not recorded automatically (${messageOf(error)}). Run \`${cli} review record --task ${active.task}\`; paste the subagent's JSON block on standard input if asked.`;
  }
  try {
    const message = await (await deps.load(found.repositoryRoot)).engine.advance({ task: active.task, session: active.owner, cause: 'review-hook', produced: [recorded.entryId], ...(input.scratchpad_dir === undefined ? {} : { scratchpadDir: input.scratchpad_dir }) });
    return contextOf(recorded, message.text);
  } catch (error) {
    return `${contextOf(recorded)}\n\n[ambicode] The review is recorded, but the route did not advance (${messageOf(error)}). Run \`${cli} route next --task ${active.task}\`.`;
  }
}
