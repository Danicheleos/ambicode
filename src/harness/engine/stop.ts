import { dirKindFor } from '#types/defaults';
import type { SessionRepository } from '#types/composition';
import type { HookInput, StopHookOutput } from '#types/hook';
import { sessionRoutes } from '../session/active-route.ts';
import { buildChain, currentIn, foldRoute } from './fold.ts';
import { answersAsNote } from './execute.ts';
import { writeSummary } from './run-context.ts';
import { readLedger } from '#platform/ledger/ledger';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { saveNote } from '#modules/evidence/notes';
import { gapsOf } from '#modules/evidence/report/report';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import { deliverOnce, hookStateBaseDir } from '#platform/claude/hook-state';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { RouteDef, RouteRegistry, StepMessage } from '#types/harness';

interface StopPorts {
  runtime: Runtime;
  routes: RouteRegistry;
  /** Completes a delivered final model step and ends the route, or ends a user-set headless route inconclusive; false when neither applies. */
  closeFinal(task: string, routeId: string, scratchpadDir?: string): Promise<boolean>;
  /** Saves the final message as the step's note and advances as `note save` would; the route's message after it. */
  answerNote(task: string, session: string, routeId: string, body: string, scratchpadDir?: string): Promise<StepMessage>;
}

const firstHeading = (instruction: string | null): string | null => instruction?.split('\n').find((line) => /^#+\s/.test(line))?.trim() ?? null;
const firstLine = (text: string): string => text.split('\n').find((line) => line.trim() !== '')?.trim() ?? '';

const squash = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** A Stop that did nothing is not the same as a Stop that was never reached: the reason is left on stderr, where the session record keeps it. */
function skipped(reason: string): null {
  process.stderr.write(`ambicode stop: skipped, ${reason}\n`);
  return null;
}

/** At a step that asks for the answer as a note, the final message is that note: saved here, then the code steps run as
 * `route next` would, so the model does not write it twice (about 700 output tokens and 4 s). */
async function saveAnswer(ports: StopPorts, at: { root: string; session: string; scratchpad: string | undefined }, active: { task: string; skill: string; routeId: string }, message: string): Promise<StepMessage | null> {
  const def = ports.routes.route(active.skill);
  const entries = await readLedger(ports.runtime.fs, taskDirFor(at.root, active.task, '.', dirKindFor(active.skill)).root).catch(() => []);
  const head = entries.find((entry) => entry.kind === 'route' && entry.id === active.routeId);
  if (def === null || def === undefined || head === undefined) return null;
  const step = foldRoute(def, buildChain(entries, head)).position;
  if (step === null || !answersAsNote(step) || message.trim() === '') return null;
  try {
    return await ports.answerNote(active.task, at.session, active.routeId, message, at.scratchpad);
  } catch (error) {
    // Unsaved, the route stays open at the step and the model can still `note save`; the reason stays on stderr like every skipped Stop.
    process.stderr.write(`ambicode stop: answer not saved, ${error instanceof Error ? error.message : String(error)}\n`);
    return null;
  }
}

/** The final message must state every current gap; it is the message the user gets, read from the hook input, not the transcript. */
export async function stopHook(ports: StopPorts, input: HookInput, found: SessionRepository): Promise<StopHookOutput | null> {
  const { runtime, routes } = ports;
  if (input.agent_id !== undefined) return null;
  if (typeof found === 'string') return skipped(`no session repository from ${input.cwd ?? runtime.cwd}`);
  const [root, session, scratchpad] = [found.repositoryRoot, input.session_id, input.scratchpad_dir];
  const latest = async () => (await sessionRoutes(runtime.fs, root, session))[0] ?? null;
  let route = await latest();
  let active = route?.live === true ? route : null;
  let answered = false;
  if (active !== null && input.last_assistant_message !== undefined) {
    const saved = await saveAnswer(ports, { root, session, scratchpad }, active, input.last_assistant_message);
    if (saved !== null) {
      route = await latest();
      active = route?.live === true ? route : null;
      answered = true;
      // The route is still open: a code step sent it back to this step, and its text is the revise. The engine's repeat bound ends the loop, so this block needs no limit entry of its own.
      if (active !== null) return { decision: 'block', reason: `Your answer was saved as the note, but a check failed. Fix it and finish again.\n\n${saved.text}` };
    }
  }
  const target = route;
  if (target === null) return skipped(`no route for session ${session} in ${root}`);
  const dir = taskDirFor(root, target.task, '.', dirKindFor(target.skill));
  // A Stop sees an exit once, and once more after the block it answered: the marker carries the block count, so the corrected message is checked and saved.
  const blocks = active === null ? (await readLedger(runtime.fs, dir.root).catch(() => [])).filter((entry) => entry.kind === 'limit' && entry['which'] === 'stop-block' && entry['route'] === target.routeId).length : 0;
  if (active === null && !(await deliverOnce(runtime.fs, hookStateBaseDir(runtime.fs, session, scratchpad), 'stop-seen', `${target.routeId}:${blocks}`))) return null;

  const message = input.last_assistant_message ?? null;
  const verdict = await withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), async (ledger): Promise<{ output: StopHookOutput | null; entries: number } | null> => {
    const read = await ledger.read();
    const entries = read.state === 'ok' ? read.entries : [];
    const head = entries.find((entry) => entry.kind === 'route' && entry.id === target.routeId && entry['session'] === session);
    const def = routes.route(target.skill);
    if (head === undefined || def === undefined || def === null) return skipped(`route ${target.routeId} of ${target.skill} is not in the ledger or the route set`);
    const chain = buildChain(entries, head);
    const heading = firstHeading([...def.steps].reverse().find((step) => step.actor === 'model')?.instruction ?? null);
    // A saved answer is the note itself: its gaps live in the ledger and the summary, and no second message is asked for.
    const finalMessage = message !== null && !answered && (active === null || (heading !== null && firstLine(message) === heading));
    if (!finalMessage) return { output: null, entries: entries.length };
    // One block per route: a second Stop lets the message through, or a model that cannot fix it would never finish.
    const stated = squash(message);
    const missing = chain.entries.some((entry) => entry.kind === 'limit' && entry['which'] === 'stop-block') ? [] : gapsOf(chain.entries, currentIn(def, chain)).filter((gap) => !stated.includes(squash(gap)));
    if (missing.length > 0) {
      await ledger.append({ kind: 'limit', route: target.routeId, which: 'stop-block', count: missing.length });
      return { output: { decision: 'block', reason: `Your final message leaves ${missing.length} gap(s) unstated. Add each, in these words:${missing.map((gap) => `\n- ${gap}`).join('')}` }, entries: entries.length };
    }
    // A route whose answer is already its note keeps one copy.
    if (!def.steps.some(answersAsNote)) {
      await saveNote({ runtime, session, context: null, ledger }, { task: target.task, kind: 'result', body: message, route: target.routeId }).catch((error: unknown) => void process.stderr.write(`ambicode stop: final message not saved, ${error instanceof Error ? error.message : String(error)}\n`));
      // A route that exited before this Stop had its summary written without the note.
      if (active === null) await writeSummary(runtime, dir, ledger);
    }
    return { output: null, entries: entries.length };
  });
  if (verdict === null) return null;
  if (active !== null && verdict.output === null) await ports.closeFinal(target.task, target.routeId, scratchpad);
  process.stderr.write(`ambicode stop: done, ${verdict.entries} ledger entries, output ${verdict.output === null ? 'none' : 'block'}${message === null ? ', no last_assistant_message' : ''}\n`);
  return verdict.output;
}
