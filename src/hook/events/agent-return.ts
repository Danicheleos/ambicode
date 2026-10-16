import { dirKindFor } from '#types/defaults';
import { AgentToolResponse, type HookInput, type HookDeps } from '#types/hook';
import { findSessionRepository } from '#platform/git/session-repository';
import { readLedger } from '#platform/ledger/ledger';
import { resolveActiveRoute, type ActiveRoute } from '#harness/session/active-route';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import type { LedgerEntry } from '#types/modules/evidence';
import type { Runtime } from '#types/composition';

export interface AgentReturn { repositoryRoot: string; active: ActiveRoute; entries: LedgerEntry[]; status: string | undefined }

/** What every PostToolUse-on-Agent handler needs first: the main thread's call to this subagent, in a status it takes, and the session's open route with its ledger. Null when the call is none of that. */
export async function agentReturn(runtime: Runtime, input: HookInput, deps: HookDeps, agent: { type: RegExp; statuses: readonly string[] }): Promise<AgentReturn | null> {
  if (input.agent_id !== undefined || input.tool_name !== 'Agent' || !agent.type.test(input.tool_input?.subagent_type ?? '')) return null;
  const status = AgentToolResponse.safeParse(input.tool_response).data?.status;
  if (status === undefined || !agent.statuses.includes(status)) return null;
  const found = await findSessionRepository(runtime, input.cwd ?? runtime.cwd);
  if (typeof found === 'string') return null;
  const active = await resolveActiveRoute(runtime.fs, deps.pointer, { repositoryRoot: found.repositoryRoot, session: input.session_id, scratchpad: input.scratchpad_dir });
  if (active === null) return null;
  const entries = await readLedger(runtime.fs, taskDirFor(found.repositoryRoot, active.task, '.', dirKindFor(active.skill)).root);
  return { repositoryRoot: found.repositoryRoot, active, entries, status };
}
