import path from 'node:path';
import { findSessionRepository } from '#platform/git/session-repository';
import { openRepository } from '#platform/git/open';
import type { HookInput, StopHookOutput } from '#types/hook';
import { endedRouteInLedger, resolveActiveRoute } from '../session/active-route.ts';
import { buildChain, currentIn, foldRoute, isGreen, windowOf } from './fold.ts';
import { ReviewResult } from '#types/modules/review';
import { containsBlock, notCoveredBlock } from '#modules/review/bundle/coverage-block';
import { harnessOf } from '../session/harness.ts';
import { citationProblems, citesRepository } from './cited.ts';
import { exportForEval } from './eval-export.ts';
import { lastAssistantText } from '#platform/claude/transcript';
import { readLedger } from '#platform/ledger/ledger';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { buildReport } from '#modules/evidence/report/report';
import { navigationLine } from '#modules/evidence/report/navigation-line';
import { saveNote } from '#modules/evidence/notes';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import { hookStateBaseDir, readStopCursor, writeStopCursor } from '#platform/claude/hook-state';
import type { Runtime } from '#types/composition';
import type { LedgerEntry, LockedLedger } from '#types/modules/evidence';
import type { ActiveRoutePointer, RouteDef, RouteRegistry } from '#types/harness';

export interface StopPorts {
  runtime: Runtime;
  routes: RouteRegistry;
  pointer: ActiveRoutePointer;
  /** Advances the owner's route as `note save` would; called after the stop lock is released. */
  advance(input: { task: string; session: string; scratchpadDir?: string }): Promise<unknown>;
  /** Completes a delivered final model step and ends the route, or ends a user-set headless route inconclusive; false when neither applies. */
  closeFinal(task: string, routeId: string, scratchpadDir?: string): Promise<boolean>;
}

export { lastAssistantText, TRANSCRIPT_TAIL_BYTES } from '#platform/claude/transcript';
export { EVAL_EXPORT_VARIABLE } from './eval-export.ts';
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

interface Checked { chain: readonly LedgerEntry[]; def: RouteDef; routes: RouteRegistry; root: string; text: string; defectBrief: boolean; files: () => Promise<readonly string[]>; citationsOnly?: boolean }

/** The report is written once a step that delivers it to the model has run. */
const reportWritten = (def: RouteDef, chain: readonly LedgerEntry[]): boolean =>
  def.steps.some((step) => step.payload.includes('report') && chain.some((entry) => entry.kind === 'step' && entry['step'] === step.id));

/** `report` is the generated block when the answer's copy of it differs; the stop-check file carries it. */
async function problemsOf(input: Checked, runtime: Runtime): Promise<{ problems: string[]; report: string | null }> {
  const problems = await citationProblems(input.text, input, runtime, input.citationsOnly === true);
  let generated: string | null = null;
  const { text } = input;
  // An answer step runs no checks and records no acceptance, so only its citations can be wrong.
  if (input.citationsOnly === true) {
    return { problems, report: null };
  }
  const current = currentIn(input.def, buildChain(input.chain, input.chain.find((entry) => entry.kind === 'route')!));
  if (/(^|\n)Evidence\b/.test(text) || /Not verified/.test(text) || reportWritten(input.def, input.chain)) {
    const report = buildReport(input.chain, { current });
    const block = squash(text);
    // 17_1451: a task route that ended blocked at ground never printed its report, and the model had no block to copy.
    if (!block.includes(squash(report.evidence)) || !block.includes(squash(report.notVerified))) {
      problems.push('The Evidence or Not verified block differs from the generated one: copy the generated block (below in the stop-check file).');
      generated = `${report.evidence}\n${report.notVerified}\n<!-- ambicode report ${report.hash} -->`;
    }
    const hash = /<!-- ambicode report (\S+) -->/.exec(text)?.[1];
    if (hash !== undefined && hash !== report.hash) problems.push('The report hash comment does not match the generated report.');
  }
  if (input.defectBrief) {
    for (const key of new Set(input.chain.filter(isGreen).map((entry) => String(entry['key'])))) if (!redBeforeGreen(input.chain, key)) problems.push(`${key}: no failing run precedes the first green one.`);
  }
  return { problems, report: generated };
}

const NOT_VERBATIM = 'the "not covered" block is not reproduced verbatim';

/** Review route: once its review ran, the final message must carry part 4 of that review's report verbatim. */
async function coverageBlockMissing(runtime: Runtime, input: { root: string; def: RouteDef; chain: readonly LedgerEntry[]; head: LedgerEntry; ended: boolean; transcript: string | undefined }): Promise<string | null> {
  const step = input.def.steps.find((candidate) => candidate.id === 'review-run');
  if (step === undefined || input.transcript === undefined) return null;
  const fold = foldRoute(input.def, buildChain(input.chain, input.head));
  const review = windowOf(fold, step).findLast((entry) => entry.kind === 'review');
  const readback = input.def.steps.find((candidate) => candidate.id === 'readback')?.index ?? 0;
  if (review === undefined || typeof review['result'] !== 'string' || (!input.ended && (fold.position?.index ?? Infinity) < readback)) return null;
  const raw = await runtime.fs.readText(path.join(input.root, review['result'])).catch(() => null);
  const parsed = raw === null ? null : (() => { try { return ReviewResult.safeParse(JSON.parse(raw)); } catch { return null; } })();
  const message = await lastAssistantText(input.transcript);
  if (parsed?.success !== true || message === null) return null;
  const block = notCoveredBlock(parsed.data);
  return containsBlock(message, block) ? null : block;
}

interface Target { task: string; skill: string; routeId: string }
interface Located { root: string; session: string; scratchpad: string | undefined; base: string; active: Target | null; ended: Target | null }

async function locate(ports: StopPorts, input: HookInput): Promise<Located | null> {
  const { runtime, pointer } = ports;
  if (input.agent_id !== undefined) return null;
  const found = await findSessionRepository(runtime, input.cwd ?? runtime.cwd);
  if (typeof found === 'string') return null;
  const [session, scratchpad] = [input.session_id, input.scratchpad_dir];
  const root = found.repositoryRoot;
  const active = await resolveActiveRoute(runtime.fs, pointer, { repositoryRoot: root, session, scratchpad, scan: false });
  const base = hookStateBaseDir(runtime.fs, session, scratchpad);
  let ended = active === null ? await pointer.readEnded(session, scratchpad) : null;
  if (active === null && ended === null) {
    // The ledger has no record of a Stop; the cursor does: a Stop that saw the whole chain has handled its exit.
    const exited = await endedRouteInLedger(runtime.fs, { repositoryRoot: root, session });
    if (exited !== null && (await readStopCursor(runtime.fs, base, exited.routeId)) < exited.entries) ended = exited;
  }
  return { root, session, scratchpad, base, active, ended: ended === null ? null : { task: ended.task, skill: ended.skill, routeId: ended.routeId } };
}

const entriesOf = async (ledger: LockedLedger): Promise<LedgerEntry[]> => {
  const read = await ledger.read();
  return read.state === 'ok' ? read.entries : [];
};

interface Verdict { output: StopHookOutput | null; save: { text: string; kind: RouteDef['steps'][number]; chain: readonly LedgerEntry[] } | null; head: LedgerEntry }

/** A Stop that did nothing is not the same as a Stop that was never reached: the reason is left on stderr, where the session record keeps it. */
function skipped(reason: string): null {
  process.stderr.write(`ambicode stop: skipped, ${reason}\n`);
  return null;
}

export async function stopHook(ports: StopPorts, input: HookInput, options: { defectBrief?: boolean } = {}): Promise<StopHookOutput | null> {
  const { runtime, pointer, routes } = ports;
  const where = await locate(ports, input);
  if (where === null) return skipped(`no session repository from ${input.cwd ?? runtime.cwd}`);
  const { root, session, scratchpad, base, active } = where;
  const target = active ?? where.ended;
  if (target === null) return skipped(`no route pointer for session ${session} in ${root}`);

  try {
    const dir = taskDirFor(root, target.task);
    const verdict = await withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), session, async (ledger): Promise<Verdict | null> => {
      const entries = await entriesOf(ledger);
      const head = entries.find((entry) => entry.kind === 'route' && entry.id === target.routeId && harnessOf(entry) === session);
      const def = routes.route(target.skill);
      if (head === undefined || def === null) return skipped(`route ${target.routeId} of ${target.skill} is not in the ledger or the route set`);
      const chain = buildChain(entries, head).entries;
      const seen = await readStopCursor(runtime.fs, base, target.routeId);
      const fresh = chain.slice(seen);
      const lastModel = [...def.steps].reverse().find((step) => step.actor === 'model');
      const note = lastModel?.produces.find((produced) => produced.kind === 'note');
      const savedNote = note === undefined ? undefined : fresh.findLast((entry) => entry.kind === 'note' && entry['note'] === note.value);

      const exited = fresh.some((entry) => entry.kind === 'exit');
      const heading = firstHeading(lastModel?.instruction ?? null);
      let listed: Promise<readonly string[]> | null = null;
      const files = (): Promise<readonly string[]> =>
        (listed ??= openRepository({ ...runtime, cwd: root })
          .then((repository) => repository.git.listFiles(null))
          .catch(() => []));
      const answering = active === null ? null : foldRoute(def, buildChain(entries, head)).position;
      let saveAnswer = false;
      let text: string | null = null;
      let unreadable = false;
      const blockedBefore = chain.some((entry) => entry.kind === 'limit' && entry['which'] === 'stop-block');
      if (answering?.answer === 'note' && savedNote === undefined) {
        const message = input.transcript_path === undefined ? null : await lastAssistantText(input.transcript_path);
        if (message === null) unreadable = !chain.some((entry) => entry.kind === 'limit' && entry['which'] === 'stop-unreadable');
        else if (await citesRepository(message, { root, files }, runtime)) {
          text = message;
          saveAnswer = true;
        } else if (blockedBefore) {
          // The user kept the blocked answer, or the model sent only corrections: the blocked answer is still the note.
          const blocked = await runtime.fs.readText(dir.answerBlocked).catch(() => null);
          const problems = await runtime.fs.readText(dir.stopCheck).catch(() => '');
          if (blocked !== null) {
            text = `${blocked.trimEnd()}\n\n## Citation problems\n\n${problems.replace(/^# Stop check\n+/, '').trimEnd()}\n\n${message.trim()}`;
            saveAnswer = true;
          }
        }
      } else if (savedNote !== undefined && typeof savedNote['path'] === 'string') {
        text = await runtime.fs.readText(path.join(root, savedNote['path'])).catch(() => null);
      } else if (exited || heading !== null) {
        const message = input.transcript_path === undefined ? null : await lastAssistantText(input.transcript_path);
        if (message === null) unreadable = !chain.some((entry) => entry.kind === 'limit' && entry['which'] === 'stop-unreadable');
        else if (exited || firstLine(message) === heading) text = message;
      }

      let output: StopHookOutput | null = null;
      const finish = async (limit: { which: string; count: number } | null): Promise<void> => {
        if (limit !== null) await ledger.append({ kind: 'limit', route: target.routeId, ...limit });
      };
      const missingBlock = unreadable || blockedBefore ? null : await coverageBlockMissing(runtime, { root, def, chain, head, ended: active === null || exited, transcript: input.transcript_path });
      if (unreadable) await finish({ which: 'stop-unreadable', count: 1 });
      else if ((text !== null || missingBlock !== null) && !blockedBefore) {
        // The task route's ground step records a defect brief.
        const defectBrief = options.defectBrief ?? chain.some((entry) => entry.kind === 'step' && entry['defectBrief'] === true);
        const { problems, report } = text === null ? { problems: [], report: null } : await problemsOf({ chain, def, routes, root, text, defectBrief, files, citationsOnly: saveAnswer }, runtime);
        if (missingBlock !== null) problems.push(`${NOT_VERBATIM}: copy part 4 of the review report as printed (below in the stop-check file).`);
        if (problems.length > 0) {
          const where = path.relative(root, dir.stopCheck);
          await runtime.fs.mkdirp(dir.root);
          await runtime.fs.writeText(dir.stopCheck, `# Stop check\n\n${problems.map((item) => `- ${item}`).join('\n')}\n${missingBlock === null ? '' : `\n${missingBlock}\n`}${report === null ? '' : `\n${report}\n`}`);
          if (saveAnswer && text !== null) await runtime.fs.writeText(dir.answerBlocked, text);
          let reason = saveAnswer ? answerBlockReason(problems.length, where, head['mode'] === 'headless') : `The text you are about to finish with has ${problems.length} problem(s). Fix them, or state them; the full list is in ${where}:`;
          saveAnswer = false;
          for (const item of problems) {
            if (Buffer.byteLength(`${reason}\n- ${item}`) > REASON_LIMIT_BYTES) break;
            reason += `\n- ${item}`;
          }
          await finish({ which: 'stop-block', count: problems.length });
          output = { decision: 'block', reason };
        }
      }
      return { output, save: saveAnswer && text !== null && answering !== null && answering !== undefined ? { text, kind: answering, chain } : null, head };
    });
    if (verdict === null) return null;
    if (verdict.save !== null) await saveAsNote(ports, { root, task: target.task, head: verdict.head, scratchpad, ...verdict.save });
    else if (active !== null && verdict.output === null) await ports.closeFinal(target.task, target.routeId, scratchpad);
    const after = await readLedger(runtime.fs, dir.root);
    process.stderr.write(`ambicode stop: done, ${after.length} ledger entries, output ${verdict.output === null ? 'none' : 'block'}\n`);
    await exportForEval(runtime, { root, session, task: target.task, ledger: dir.ledger, entries: after });
    await writeStopCursor(runtime.fs, base, target.routeId, buildChain(after, verdict.head).entries.length);
    if (verdict.save !== null) await pointer.clearEnded(session, scratchpad);
    return verdict.output;
  } finally {
    if (active === null) await pointer.clearEnded(session, scratchpad);
  }
}

/** The final message is what the user gets and what is saved, so a correction must restate the whole answer. */
function answerBlockReason(citations: number, where: string, headless: boolean): string {
  const rewrite = 'write the whole answer again with the citations fixed; it replaces the previous one and is saved as the note';
  const head = `Your answer has ${citations} citation problem(s); the full list is in ${where}.`;
  if (headless) return `${head} Nobody can be asked in this session: ${rewrite}.`;
  return `${head} Ask the user with AskUserQuestion whether to keep the answer as it is or rewrite it. If they choose rewrite, ${rewrite}. If they keep it, just stop.`;
}

/**
 * The answer becomes the step's note, then the route advances as `note save` would advance it. The note is written
 * under the route's owner, not the Claude session, after the stop lock is released.
 */
async function saveAsNote(ports: StopPorts, input: { root: string; task: string; head: LedgerEntry; chain: readonly LedgerEntry[]; text: string; kind: RouteDef['steps'][number]; scratchpad: string | undefined }): Promise<void> {
  const owner = String(input.head['session']);
  const kind = input.kind.produces.find((produced) => produced.kind === 'note')?.value;
  if (kind === null || kind === undefined) return;
  const routeRuntime = { ...ports.runtime, cwd: input.root };
  const body = `${input.text.trimEnd()}\n\n${navigationLine(input.chain)}\n`;
  await saveNote({ runtime: routeRuntime, session: owner, context: null }, { task: input.task, kind: kind as Parameters<typeof saveNote>[1]['kind'], body, from: null, iteration: null, route: input.head.id });
  await ports.advance({ task: input.task, session: owner, ...(input.scratchpad === undefined ? {} : { scratchpadDir: input.scratchpad }) });
}
