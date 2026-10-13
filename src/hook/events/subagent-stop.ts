import path from 'node:path';
import { dirKindFor, MAX_EVIDENCE_BYTES } from '#types/defaults';
import type { HookInput, RouteHookDeps } from '#types/hook';
import { findSessionRepository } from '#platform/git/session-repository';
import { readLedger } from '#platform/ledger/ledger';
import { resolveActiveRoute } from '#harness/session/active-route';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import { pendingReview, REVIEWER_AGENT_TYPE, REVIEWER_ANSWER_FILE } from '#modules/review/answer/captured';
import type { Runtime } from '#types/composition';

/**
 * The reviewer's final message goes to the review directory as it was sent, so `review record` reads it and the main
 * model need not re-type it (about 700 output tokens and 3-4 s per review). Recording, validation and rejection stay in
 * `review record`: a hook that records would show the main model nothing when the answer is refused.
 */
export async function captureReviewerAnswer(runtime: Runtime, input: HookInput, deps: RouteHookDeps): Promise<void> {
  if (!REVIEWER_AGENT_TYPE.test(input.agent_type ?? '')) return;
  const answer = input.last_assistant_message;
  if (answer === undefined || answer.trim() === '') return void process.stderr.write('ambicode subagent-stop: reviewer sent no final message, nothing captured\n');
  if (Buffer.byteLength(answer) > MAX_EVIDENCE_BYTES) return void process.stderr.write(`ambicode subagent-stop: reviewer answer is over ${MAX_EVIDENCE_BYTES} bytes, nothing captured\n`);
  const found = await findSessionRepository(runtime, input.cwd ?? runtime.cwd);
  if (typeof found === 'string') return;
  const active = await resolveActiveRoute(runtime.fs, deps.pointer, { repositoryRoot: found.repositoryRoot, session: input.session_id, scratchpad: input.scratchpad_dir });
  if (active === null) return void process.stderr.write(`ambicode subagent-stop: no route for session ${input.session_id}, nothing captured\n`);
  const pending = pendingReview(await readLedger(runtime.fs, taskDirFor(found.repositoryRoot, active.task, '.', dirKindFor(active.skill)).root), null);
  if (pending === undefined) return void process.stderr.write(`ambicode subagent-stop: task ${active.task} has no review waiting for its reviewer, nothing captured\n`);
  await runtime.fs.writeText(path.join(found.repositoryRoot, path.dirname(String(pending['result'])), REVIEWER_ANSWER_FILE), answer);
}
