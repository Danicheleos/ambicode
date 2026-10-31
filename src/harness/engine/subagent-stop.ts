import { dirKindFor } from '#types/defaults';
import type { SessionRepository } from '#types/composition';
import type { HookInput } from '#types/hook';
import type { Runtime } from '#types/composition';
import type { RouteRegistry } from '#types/harness';
import { finalReportOf } from '#platform/claude/transcript';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { saveNote } from '#modules/evidence/notes';
import { gapsOf, unstated } from '#modules/evidence/report/report';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import { liveRouteOf } from '../session/active-route.ts';
import { buildChain, currentIn, foldRoute } from './fold.ts';
import { isClosing } from './execute.ts';

/** The plugin's implementer, however the host qualifies its name. */
export const isImplementer = (agentType: string | undefined): boolean => agentType !== undefined && /(^|:)implementer$/.test(agentType);

/**
 * The implementer's final report, read from its transcript when it stops, so the main session never has to carry or restate it.
 * At the route's closing step the message is the task report: saved whole, with any gap line the ledger holds and it left out
 * appended by code. At any other step it is the round's Changed/Gaps list: a note, so the report written later can name every round.
 */
export async function subagentStopHook(ports: { runtime: Runtime; routes: RouteRegistry }, input: HookInput, found: SessionRepository): Promise<void> {
  const { runtime, routes } = ports;
  if (!isImplementer(input.agent_type) || input.agent_transcript_path === undefined || typeof found === 'string') return;
  const skip = (reason: string): void => void process.stderr.write(`ambicode subagent-stop: skipped, ${reason}\n`);
  const text = finalReportOf(await runtime.fs.readText(input.agent_transcript_path).catch(() => ''));
  if (text === null || text.trim() === '') return skip(`no final report in ${input.agent_transcript_path}`);
  const route = await liveRouteOf(runtime.fs, found.repositoryRoot, input.session_id, runtime.clock.now());
  if (route === null) return skip(`no live route for session ${input.session_id}`);
  const dir = taskDirFor(found.repositoryRoot, route.task, '.', dirKindFor(route.skill));
  await withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), async (ledger) => {
    const read = await ledger.read();
    const entries = read.state === 'ok' ? read.entries : [];
    const head = entries.find((entry) => entry.kind === 'route' && entry.id === route.routeId);
    const def = routes.route(route.skill);
    if (head === undefined || def === undefined || def === null) return skip(`route ${route.routeId} is not in the ledger or the route set`);
    const chain = buildChain(entries, head);
    const fold = foldRoute(def, chain);
    const deps = { runtime, session: input.session_id, context: null, ledger };
    if (fold.position === null || !isClosing(fold, fold.position)) {
      await saveNote(deps, { task: route.task, kind: 'changed', body: text, route: route.routeId });
      return;
    }
    const missing = unstated(gapsOf(chain.entries, currentIn(def, chain)), text);
    const body = missing.length === 0 ? text : `${text.trimEnd()}\n\nNot verified (left out above)\n${missing.map((gap) => `- ${gap}`).join('\n')}`;
    await saveNote(deps, { task: route.task, kind: 'report', body, route: route.routeId });
  });
}
