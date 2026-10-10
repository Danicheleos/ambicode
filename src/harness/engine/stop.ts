import { dirKindFor } from '#types/defaults';
import path from 'node:path';
import { findSessionRepository } from '#platform/git/session-repository';
import type { HookInput, StopHookOutput } from '#types/hook';
import { endedRouteInLedger, resolveActiveRoute } from '../session/active-route.ts';
import { buildChain, currentIn, isGreen } from './fold.ts';
import { harnessOf } from '../session/harness.ts';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { buildReport } from '#modules/evidence/report/report';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import { deliverOnce, hookStateBaseDir } from '#platform/claude/hook-state';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { ActiveRoutePointer, RouteDef, RouteRegistry } from '#types/harness';

export interface StopPorts {
  runtime: Runtime;
  routes: RouteRegistry;
  pointer: ActiveRoutePointer;
  /** Completes a delivered final model step and ends the route, or ends a user-set headless route inconclusive; false when neither applies. */
  closeFinal(task: string, routeId: string, scratchpadDir?: string): Promise<boolean>;
}

export const REASON_LIMIT_BYTES = 2048;

/** A failing check precedes the first green one of the key: the defect was shown before it was fixed. */
export function redBeforeGreen(entries: readonly LedgerEntry[], key: string): boolean {
  const runs = entries.filter((entry) => entry.kind === 'check' && entry['key'] === key);
  const green = runs.findIndex(isGreen);
  if (green < 0) return true;
  return runs.slice(0, green).some((run) => run['exit'] !== 0);
}

const squash = (value: string): string => value.replace(/\s+/g, ' ').trim();
const firstHeading = (instruction: string | null): string | null => instruction?.split('\n').find((line) => /^#+\s/.test(line))?.trim() ?? null;
const firstLine = (text: string): string => text.split('\n').find((line) => line.trim() !== '')?.trim() ?? '';

/** The report is written once a step that delivers it to the model has run. */
const reportWritten = (def: RouteDef, chain: readonly LedgerEntry[]): boolean =>
  def.steps.some((step) => step.payload.includes('report') && chain.some((entry) => entry.kind === 'step' && entry['step'] === step.id));

/** `generated` is the block the message's copy differs from; the stop-check file carries it. */
function problemsOf(chain: readonly LedgerEntry[], def: RouteDef, text: string, defectBrief: boolean): { problems: string[]; generated: string | null } {
  const problems: string[] = [];
  let generated: string | null = null;
  if (/(^|\n)Evidence\b/.test(text) || /Not verified/.test(text) || reportWritten(def, chain)) {
    const report = buildReport(chain, { current: currentIn(def, buildChain(chain, chain.find((entry) => entry.kind === 'route')!)) });
    const block = squash(text);
    // 17_1451: a task route that ended blocked at ground never printed its report, and the model had no block to copy.
    if (!block.includes(squash(report.evidence)) || !block.includes(squash(report.notVerified))) {
      problems.push('The Evidence or Not verified block differs from the generated one: copy the generated block (below in the stop-check file).');
      generated = `${report.evidence}\n${report.notVerified}\n<!-- ambicode report ${report.hash} -->`;
    }
    const hash = /<!-- ambicode report (\S+) -->/.exec(text)?.[1];
    if (hash !== undefined && hash !== report.hash) problems.push('The report hash comment does not match the generated report.');
  }
  if (defectBrief) {
    for (const key of new Set(chain.filter(isGreen).map((entry) => String(entry['key'])))) if (!redBeforeGreen(chain, key)) problems.push(`${key}: no failing run precedes the first green one.`);
  }
  return { problems, generated };
}

/** A Stop that did nothing is not the same as a Stop that was never reached: the reason is left on stderr, where the session record keeps it. */
function skipped(reason: string): null {
  process.stderr.write(`ambicode stop: skipped, ${reason}\n`);
  return null;
}

/** The final message must carry the generated report; it is the message the user gets, read from the hook input, not the transcript. */
export async function stopHook(ports: StopPorts, input: HookInput, options: { defectBrief?: boolean } = {}): Promise<StopHookOutput | null> {
  const { runtime, pointer, routes } = ports;
  if (input.agent_id !== undefined) return null;
  const found = await findSessionRepository(runtime, input.cwd ?? runtime.cwd);
  if (typeof found === 'string') return skipped(`no session repository from ${input.cwd ?? runtime.cwd}`);
  const [root, session, scratchpad] = [found.repositoryRoot, input.session_id, input.scratchpad_dir];
  const active = await resolveActiveRoute(runtime.fs, pointer, { repositoryRoot: root, session, scratchpad, scan: false });
  const target = active ?? (await endedRouteInLedger(runtime.fs, { repositoryRoot: root, session }));
  if (target === null) return skipped(`no route for session ${session} in ${root}`);
  // A Stop sees an exit once: the ledger names the exited route, one marker says it was looked at.
  if (active === null && !(await deliverOnce(runtime.fs, hookStateBaseDir(runtime.fs, session, scratchpad), 'stop-seen', target.routeId))) return null;

  const dir = taskDirFor(root, target.task, '.', dirKindFor(target.skill));
  const message = input.last_assistant_message ?? null;
  const verdict = await withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), session, async (ledger): Promise<{ output: StopHookOutput | null; entries: number } | null> => {
    const read = await ledger.read();
    const entries = read.state === 'ok' ? read.entries : [];
    const head = entries.find((entry) => entry.kind === 'route' && entry.id === target.routeId && harnessOf(entry) === session);
    const def = routes.route(target.skill);
    if (head === undefined || def === undefined || def === null) return skipped(`route ${target.routeId} of ${target.skill} is not in the ledger or the route set`);
    const chain = buildChain(entries, head).entries;
    const heading = firstHeading([...def.steps].reverse().find((step) => step.actor === 'model')?.instruction ?? null);
    const finalMessage = message !== null && (active === null || (heading !== null && firstLine(message) === heading));
    // One block per route: a second Stop lets the message through, or a model that cannot fix it would never finish.
    if (!finalMessage || chain.some((entry) => entry.kind === 'limit' && entry['which'] === 'stop-block')) return { output: null, entries: entries.length };
    const defectBrief = options.defectBrief ?? chain.some((entry) => entry.kind === 'step' && entry['defectBrief'] === true);
    const { problems, generated } = problemsOf(chain, def, message, defectBrief);
    if (problems.length === 0) return { output: null, entries: entries.length };
    const where = path.relative(root, dir.stopCheck);
    await runtime.fs.mkdirp(dir.root);
    await runtime.fs.writeText(dir.stopCheck, `# Stop check\n\n${problems.map((item) => `- ${item}`).join('\n')}\n${generated === null ? '' : `\n${generated}\n`}`);
    let reason = `The text you are about to finish with has ${problems.length} problem(s). Fix them, or state them; the full list is in ${where}:`;
    for (const item of problems) {
      if (Buffer.byteLength(`${reason}\n- ${item}`) > REASON_LIMIT_BYTES) break;
      reason += `\n- ${item}`;
    }
    await ledger.append({ kind: 'limit', route: target.routeId, which: 'stop-block', count: problems.length });
    return { output: { decision: 'block', reason }, entries: entries.length };
  });
  if (verdict === null) return null;
  if (active !== null && verdict.output === null) await ports.closeFinal(target.task, target.routeId, scratchpad);
  process.stderr.write(`ambicode stop: done, ${verdict.entries} ledger entries, output ${verdict.output === null ? 'none' : 'block'}${message === null ? ', no last_assistant_message' : ''}\n`);
  return verdict.output;
}
