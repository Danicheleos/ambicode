import { findSessionRepository } from '#platform/git/session-repository';
import { AskUserQuestionResponse, type HookInput, type RouteHookDeps } from '#types/hook';
import { resolveActiveRoute } from '#harness/session/active-route';
import { sessionLatest } from '#harness/engine/reopen';
import { readLedger } from '#platform/ledger/ledger';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import { PLATFORM, type PlatformFlags } from '#types/platform/claude';
import type { Runtime } from '#types/composition';
import { MARKER, type Answer } from '#types/harness';

type Asked = Answer & { question: string };

/**
 * An AskUserQuestion the user answered is a gate answer when the question carries the printed marker; a question that
 * only repeats an open gate's text is an answer without a usable marker, which binds nothing (03-G4).
 */
async function gateAnswers(input: HookInput, entries: readonly { kind: string; gate?: unknown; question?: unknown }[]): Promise<Asked[]> {
  const given = AskUserQuestionResponse.safeParse(input.tool_response);
  const questions = input.tool_input?.questions ?? [];
  if (!given.success || given.data.answers === undefined) return [];
  const asked: Asked[] = [];
  for (const question of questions) {
    const option = given.data.answers[question.question];
    if (option === undefined) continue;
    const freeText = !(question.options ?? []).some((candidate) => candidate.label === option);
    const marker = MARKER.exec(question.question);
    if (marker !== null) {
      asked.push({ gate: marker[1]!, option, ...(marker[2] === undefined ? {} : { instance: marker[2] }), ...(freeText ? { freeText } : {}), question: question.question });
      continue;
    }
    const print = entries.findLast((entry) => entry.kind === 'gate' && typeof entry.question === 'string' && question.question.toLowerCase().includes(entry.question.toLowerCase()));
    if (print !== undefined) asked.push({ gate: String(print.gate), option, ...(freeText ? { freeText } : {}), question: question.question });
  }
  return asked;
}

/** PostToolUse on AskUserQuestion: record the answers against the printed instances and advance (03-H5). */
export async function answerGates(runtime: Runtime, input: HookInput, deps: RouteHookDeps, platform: PlatformFlags = PLATFORM): Promise<string | null> {
  if (input.agent_id !== undefined || input.tool_name !== 'AskUserQuestion' || platform.askBinding !== 'supported') return null;
  const found = await findSessionRepository(runtime, input.cwd ?? runtime.cwd);
  if (typeof found === 'string') return null;
  const pointed = await resolveActiveRoute(runtime.fs, deps.pointer, { repositoryRoot: found.repositoryRoot, session: input.session_id, scratchpad: input.scratchpad_dir });
  // A completed route has no pointer; an answer to one of its gates goes to the session's latest route, which reopens it.
  const latest = pointed !== null || input.session_id === undefined ? null : await sessionLatest(runtime, found.repositoryRoot, input.session_id, 'harnessSession');
  const active = pointed ?? (latest === null ? null : { task: latest.task, owner: latest.owner });
  if (active === null) return null;
  const answers = await gateAnswers(input, await readLedger(runtime.fs, taskDirFor(found.repositoryRoot, active.task).root));
  if (answers.length === 0) return null;
  const advancing = deps.engine.advance({ task: active.task, session: active.owner, cause: 'gate-hook', answers, ...(input.scratchpad_dir === undefined ? {} : { scratchpadDir: input.scratchpad_dir }) });
  const message = pointed !== null ? await advancing : await advancing.catch(() => null);
  if (message === null) return null;
  return platform.answerContext === 'supported' ? message.text : null;
}
