import path from 'node:path';
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
 * At the route's closing step the task report is the one the implementer saved with `note save` (its final message is one line),
 * or the message itself when it saved none: kept whole, with any gap line the ledger holds and it left out appended by code. At any other step it is the round's Changed/Gaps list: a note, so the report written later can name every round.
 */
export async function subagentStopHook(ports: { runtime: Runtime; routes: RouteRegistry }, input: HookInput, found: SessionRepository): Promise<void> {
  const { runtime, routes } = ports;
  if (!isImplementer(input.agent_type) || input.agent_transcript_path === undefined || typeof found === 'string') return;
  const skip = (reason: string): void => void process.stderr.write(`ambicode subagent-stop: skipped, ${reason}\n`);
  const final = finalReportOf(await runtime.fs.readText(input.agent_transcript_path).catch(() => ''));
  const route = await liveRouteOf(runtime.fs, found.repositoryRoot, input.session_id);
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
    const closing = fold.position !== null && isClosing(fold, fold.position);
    // At the closing step the implementer saves the report itself (`note save --kind report`) and ends on one line: main gets the report once.
    const saved = closing ? entries.findLast((entry) => entry.kind === 'note' && entry['note'] === 'report' && entry['route'] === route.routeId) : undefined;
    const text = saved === undefined ? final : await runtime.fs.readText(path.join(dir.repositoryRoot, String(saved['path']))).catch(() => final);
    if (text === null || text.trim() === '') return skip(`no final report in ${input.agent_transcript_path}`);
    if (!closing) {
      await saveNote(deps, { task: route.task, kind: 'changed', body: text, route: route.routeId });
      return;
    }
    // No saved report: the final message stands as the report, and the gap tells the reader it may be only the closing line.
    const unsaved = saved === undefined ? await ledger.append({ kind: 'limit', route: route.routeId, which: 'report-not-saved', count: 1, message: text.trim() }) : null;
    // The model sometimes opens with a line of narration before the report; 2 of 6 eval runs saved it above "# Task report".
    const withGap = unsaved === null ? chain : buildChain([...entries, unsaved], head);
    const report = text.replace(/^[\s\S]*?(?=^#{1,6} )/m, '');
    const missing = unstated(gapsOf(withGap.entries, currentIn(def, withGap)), report);
    if (saved !== undefined && missing.length === 0) return;
    const body = missing.length === 0 ? report : `${report.trimEnd()}\n\nNot verified (left out above)\n${missing.map((gap) => `- ${gap}`).join('\n')}`;
    await saveNote(deps, { task: route.task, kind: 'report', body, route: route.routeId });
  });
}
