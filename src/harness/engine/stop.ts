import { open } from 'node:fs/promises';
import path from 'node:path';
import { findSessionRepository } from '#platform/git/session-repository';
import { openRepository } from '#platform/git/open';
import type { HookInput, StopHookOutput } from '#types/hook';
import { endedRouteInLedger, resolveActiveRoute } from '../session/active-route.ts';
import { buildChain, currentIn, foldRoute, isBoundAnswer, isGreen, openPrint, sinceReopen, windowOf } from './fold.ts';
import { ReviewResult } from '#types/modules/review';
import { containsBlock, notCoveredBlock } from '#modules/review/bundle/coverage-block';
import { harnessOf } from '../session/harness.ts';
import { readLedger } from '#platform/ledger/ledger';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { buildReport } from '#modules/evidence/report/report';
import { navigationLine } from '#modules/evidence/report/navigation-line';
import { NOTE_LABELS, saveNote } from '#modules/evidence/notes';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import { hookStateBaseDir, readStopCursor, writeStopCursor } from '#platform/claude/hook-state';
import { rejectedGateMarker, turnSummary } from '#platform/claude/transcript';
import { MARKER } from '#types/harness';
import { contentHash } from '#util/hash';
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

export const TRANSCRIPT_TAIL_BYTES = 1024 * 1024;
export const REASON_LIMIT_BYTES = 2048;

/** A failing check precedes the first green one of the key: the defect was shown before it was fixed. */
export function redBeforeGreen(entries: readonly LedgerEntry[], key: string): boolean {
  const runs = entries.filter((entry) => entry.kind === 'check' && entry['key'] === key);
  const green = runs.findIndex(isGreen);
  if (green < 0) return true;
  return runs.slice(0, green).some((run) => run['exit'] !== 0 && ((run['summary'] as { failed?: number } | null)?.failed ?? 0) >= 1);
}

/** The text of the last assistant turn, read from the end of the transcript; null when it cannot be read. */
export async function lastAssistantText(transcript: string): Promise<string | null> {
  try {
    const handle = await open(transcript, 'r');
    try {
      const { size } = await handle.stat();
      const length = Math.min(size, TRANSCRIPT_TAIL_BYTES);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, size - length);
      const lines = buffer.toString('utf8').split('\n').slice(size > length ? 1 : 0);
      for (const line of lines.reverse()) {
        if (line.trim() === '') continue;
        let entry: { type?: string; message?: { role?: string; content?: unknown } };
        try {
          entry = JSON.parse(line) as typeof entry;
        } catch {
          continue;
        }
        if (entry.type !== 'assistant' && entry.message?.role !== 'assistant') continue;
        const content = entry.message?.content;
        const text = typeof content === 'string' ? content : Array.isArray(content) ? content.flatMap((block: { type?: string; text?: string }) => (block.type === 'text' && typeof block.text === 'string' ? [block.text] : [])).join('\n') : '';
        if (text.trim() !== '') return text;
      }
      return null;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

const TESTS_PASS = [/\btests? (?:pass(?:ed|es|ing)?|are green)\b/i, /\ball tests pass/i];

const squash = (value: string): string => value.replace(/\s+/g, ' ').trim();
const firstHeading = (instruction: string | null): string | null => instruction?.split('\n').find((line) => /^#+\s/.test(line))?.trim() ?? null;
const firstLine = (text: string): string => text.split('\n').find((line) => line.trim() !== '')?.trim() ?? '';

interface Checked { chain: readonly LedgerEntry[]; def: RouteDef; routes: RouteRegistry; root: string; text: string; defectBrief: boolean; files: () => Promise<readonly string[]>; citationsOnly?: boolean }

const CITATION = /(?<![\w:/])((?:\/|[\w.-]+\/)?[\w./-]*[\w-]\.[A-Za-z][A-Za-z0-9]*):(\d+)(?:-(\d+))?/g;
/** A path with a directory part, or a bare file name with a line: what an answer cites. */
const CITED_PATH = /(?<![\w:/@])((?:[\w.-]+\/)+[\w.-]*[\w-]\.[A-Za-z][A-Za-z0-9]*|[\w-][\w.-]*\.[A-Za-z][A-Za-z0-9]*(?=:\d))/g;

/**
 * The repository file a cited path names: as written from the root, else the one file whose path ends with it (a bare
 * name, or a path relative to a feature directory); `ambiguous` when several do.
 */
async function locateCited(cited: string, input: Pick<Checked, 'root' | 'files'>, runtime: Runtime): Promise<string | 'ambiguous' | null> {
  const file = path.isAbsolute(cited) ? cited : path.join(input.root, cited);
  if (await runtime.fs.exists(file)) return file;
  if (path.isAbsolute(cited)) return null;
  const tail = cited.replace(/^\.\//, '');
  const named = (await input.files()).filter((candidate) => candidate === tail || candidate.endsWith(`/${tail}`));
  if (named.length > 1) return 'ambiguous';
  return named.length === 1 ? path.join(input.root, named[0]!) : null;
}

/** An answer is report-shaped when it cites at least one file that exists in the repository. */
async function citesRepository(text: string, input: Pick<Checked, 'root' | 'files'>, runtime: Runtime): Promise<boolean> {
  for (const match of text.matchAll(CITED_PATH)) {
    if (match.index > 0 && text.slice(Math.max(0, match.index - 3), match.index).includes('//')) continue;
    const found = await locateCited(match[1]!, input, runtime);
    if (found !== null && found !== 'ambiguous' && !path.relative(input.root, found).startsWith('..')) return true;
  }
  return false;
}

/** The report is written once a step that delivers it to the model has run. */
const reportWritten = (def: RouteDef, chain: readonly LedgerEntry[]): boolean =>
  def.steps.some((step) => step.payload.includes('report') && chain.some((entry) => entry.kind === 'step' && entry['step'] === step.id));

/** A bound acceptance of an acting option that no later revise replaced; a default taken is not one. */
function actingAcceptance(input: Pick<Checked, 'chain' | 'def' | 'routes'>, current: (entry: LedgerEntry) => boolean): boolean {
  return input.chain.some((entry) => {
    if (entry.kind !== 'acceptance' || !isBoundAnswer(entry) || !current(entry)) return false;
    const gate = input.def.steps.find((step) => step.gate?.id === entry['gate'])?.gate ?? input.routes.gate(String(entry['gate']));
    return gate !== null && gate !== undefined && gate.acting.includes(String(entry['answer']));
  });
}

async function problemsOf(input: Checked, runtime: Runtime): Promise<string[]> {
  const problems: string[] = [];
  const { text, root } = input;
  for (const match of text.matchAll(CITATION)) {
    if (match[0].includes('://')) continue;
    const found = await locateCited(match[1]!, input, runtime);
    if (found === 'ambiguous') continue;
    const file = found ?? (path.isAbsolute(match[1]!) ? match[1]! : path.join(root, match[1]!));
    if (path.relative(root, file).startsWith('..')) continue;
    // In an answer a range that starts inside the file only overshoots its end; the cited code is there.
    const last = Number(input.citationsOnly === true ? match[2] : (match[3] ?? match[2]));
    try {
      const content = await runtime.fs.readText(file);
      const lines = content.split('\n').length - (/\n$/.test(content) ? 1 : 0);
      if (last > lines) problems.push(`${match[0]}: ${path.relative(root, file)} has ${lines} lines.`);
    } catch {
      problems.push(`${match[0]}: ${path.relative(root, file)} does not exist.`);
    }
  }
  // An answer step runs no checks and records no acceptance, so only its citations can be wrong.
  if (input.citationsOnly === true) return problems;
  const current = currentIn(input.def, buildChain(input.chain, input.chain.find((entry) => entry.kind === 'route')!));
  if (/(^|\n)Evidence\b/.test(text) || /Not verified/.test(text) || reportWritten(input.def, input.chain)) {
    const report = buildReport(input.chain, { current });
    const block = squash(text);
    if (!block.includes(squash(report.evidence)) || !block.includes(squash(report.notVerified))) problems.push('The Evidence or Not verified block differs from the generated one: copy it from the report command.');
    const hash = /<!-- ambicode report (\S+) -->/.exec(text)?.[1];
    if (hash !== undefined && hash !== report.hash) problems.push('The report hash comment does not match the generated report.');
  }
  if (/\b(accepted|approved)\b/i.test(NOTE_LABELS.reduce((rest, label) => rest.replaceAll(label, ''), text)) && !actingAcceptance(input, current)) problems.push('The text says accepted or approved; no bound acceptance by the user is current.');
  if (TESTS_PASS.some((phrase) => phrase.test(text)) && !input.chain.some((entry) => entry.kind === 'check' && entry['phase'] !== 'red' && isGreen(entry))) problems.push('The text says tests pass; no check with exit 0, a test count and no failures is recorded.');
  if (input.defectBrief) {
    for (const key of new Set(input.chain.filter(isGreen).map((entry) => String(entry['key'])))) if (!redBeforeGreen(input.chain, key)) problems.push(`${key}: no failing run precedes the first green one.`);
  }
  return problems;
}

/** Cell text only: column padding, Markdown pipes, separator rows and code fences do not count. */
const cells = (value: string): string =>
  squash(
    value
      .split('\n')
      .filter((line) => !/^\s*(```.*|[|:\-\s]+)$/.test(line))
      .join('\n')
      .replaceAll('|', ' '),
  );

/** A final message presenting the doctor table must carry the same cells as `steps/doctor.md`, however it is laid out. */
async function doctorReadBackProblem(runtime: Runtime, dir: { steps: string }, text: string): Promise<string | null> {
  const expected = await runtime.fs.readText(path.join(dir.steps, 'doctor.md')).catch(() => null);
  if (expected === null) return null;
  const table = expected.replace(/\n<!-- ambicode doctor \S+ -->\s*$/, '').trimEnd();
  const header = cells(table.split('\n')[0] ?? '');
  const said = cells(text);
  if (header === '' || !said.includes(header)) return null;
  if (said.includes(cells(table))) return null;
  return 'The doctor table in your answer does not match steps/doctor.md; quote it as printed.';
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
  const ended = active === null ? ((await pointer.readEnded(session, scratchpad)) ?? (await endedRouteInLedger(runtime.fs, { repositoryRoot: root, session }))) : null;
  return { root, session, scratchpad, base: hookStateBaseDir(runtime.fs, session, scratchpad), active, ended: ended === null ? null : { task: ended.task, skill: ended.skill, routeId: ended.routeId } };
}

/** The route pauses when the user dismissed the question of its still-unanswered gate print. */
async function pauseOnDismissal(ledger: LockedLedger, chain: readonly LedgerEntry[], head: LedgerEntry, transcript: string | undefined, source: string): Promise<boolean> {
  if (transcript === undefined || sinceReopen(chain).some((entry) => entry.kind === 'exit')) return false;
  const rejected = await rejectedGateMarker(transcript);
  const parsed = rejected === null ? null : MARKER.exec(rejected.marker);
  if (parsed === null || !openPrint(chain, parsed[1]!, parsed[2])) return false;
  // Without an instance in the marker, only a dismissal after the latest print counts: an older one belongs to an earlier print.
  const print = chain.findLast((entry) => entry.kind === 'gate' && entry['gate'] === parsed[1]);
  if (parsed[2] === undefined && (rejected!.at === null || print === undefined || Date.parse(rejected!.at) < Date.parse(print.at))) return false;
  await ledger.append({ kind: 'exit', route: head.id, reason: 'dismissed', detail: `${parsed[1]}: the question was dismissed`, source });
  return true;
}

const entriesOf = async (ledger: LockedLedger): Promise<LedgerEntry[]> => {
  const read = await ledger.read();
  return read.state === 'ok' ? read.entries : [];
};

/** UserPromptSubmit: a dismissal recorded before the user's next prompt pauses the route, so the prompt may reopen it. */
export async function dismissedGate(ports: StopPorts, input: HookInput): Promise<boolean> {
  const where = await locate(ports, input);
  if (where?.active == null) return false;
  const { runtime } = ports;
  const dir = taskDirFor(where.root, where.active.task);
  const paused = await withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), where.session, async (ledger) => {
    const entries = await entriesOf(ledger);
    const head = entries.find((entry) => entry.kind === 'route' && entry.id === where.active!.routeId);
    return head !== undefined && (await pauseOnDismissal(ledger, buildChain(entries, head).entries, head, input.transcript_path, 'prompt'));
  });
  if (paused) await ports.pointer.clear(where.session, where.scratchpad);
  return paused;
}

interface Verdict { output: StopHookOutput | null; paused: boolean; save: { text: string; kind: RouteDef['steps'][number]; chain: readonly LedgerEntry[] } | null; head: LedgerEntry }

/** Stop's three conditions, the checks they run, and the single block they may cause, all decided under one ledger lock. */
/** A Stop that did nothing is not the same as a Stop that was never reached: the reason is left on stderr, where the session record keeps it. */
function skipped(reason: string): null {
  process.stderr.write(`ambicode stop: skipped, ${reason}\n`);
  return null;
}

export async function stopHook(ports: StopPorts, input: HookInput, options: { defectBrief?: boolean } = {}): Promise<StopHookOutput | null> {
  const { runtime, pointer, routes } = ports;
  const startedAt = runtime.clock.elapsed();
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
      if (active !== null && (await pauseOnDismissal(ledger, chain, head, input.transcript_path, 'stop'))) return { output: null, paused: true, save: null, head };
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
        const problems = text === null ? [] : await problemsOf({ chain, def, routes, root, text, defectBrief, files, citationsOnly: saveAnswer }, runtime);
        const doctorProblem = text === null ? null : await doctorReadBackProblem(runtime, dir, text);
        if (doctorProblem !== null) problems.push(doctorProblem);
        if (missingBlock !== null) problems.push(`${NOT_VERBATIM}: copy part 4 of the review report as printed (below in the stop-check file).`);
        if (problems.length > 0) {
          const where = path.relative(root, dir.stopCheck);
          await runtime.fs.mkdirp(dir.root);
          await runtime.fs.writeText(dir.stopCheck, `# Stop check\n\n${problems.map((item) => `- ${item}`).join('\n')}\n${missingBlock === null ? '' : `\n${missingBlock}\n`}`);
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
      const previous = chain.findLast((entry) => entry.kind === 'turn' && typeof entry['lastMessage'] === 'string');
      const turn = input.transcript_path === undefined ? null : await turnSummary(input.transcript_path, previous === undefined ? null : String(previous['lastMessage']));
      if (turn !== null) await ledger.append({ kind: 'turn', route: head.id, from: chain[seen]?.id ?? head.id, to: chain.at(-1)?.id ?? head.id, ...turn });
      await ledger.append({ kind: 'hook', route: head.id, name: 'stop', ms: Math.max(0, Math.round(runtime.clock.elapsed() - startedAt)) });
      return { output, paused: false, save: saveAnswer && text !== null && answering !== null && answering !== undefined ? { text, kind: answering, chain } : null, head };
    });
    if (verdict === null) return null;
    if (verdict.paused) {
      await pointer.clear(session, scratchpad);
      return null;
    }
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

export const EVAL_EXPORT_VARIABLE = 'EVAL_AMBICODE_EXPORT';

/**
 * Under an eval, the final ledger and its notes are copied out of the sandbox, which the harness deletes when the run
 * ends: polling it every 2 s left 7 of runs 24–27's ledgers short of their last entries. A failure is said, never thrown.
 */
async function exportForEval(runtime: Runtime, input: { root: string; session: string; task: string; ledger: string; entries: readonly LedgerEntry[] }): Promise<void> {
  const root = runtime.env[EVAL_EXPORT_VARIABLE];
  if (root === undefined || root === '') return;
  try {
    const target = path.join(root, input.session, input.task);
    await runtime.fs.mkdirp(path.join(target, 'notes'));
    const notes = [...new Set(input.entries.filter((entry) => entry.kind === 'note' && typeof entry['path'] === 'string').map((entry) => String(entry['path'])))];
    const files = [await exportFile(runtime, input.ledger, target, 'ledger.jsonl')];
    for (const note of notes) files.push(await exportFile(runtime, path.join(input.root, note), target, path.join('notes', path.basename(note))));
    const complete = files.every((file) => file.copied);
    if (!complete) process.stderr.write(`ambicode stop: export incomplete, ${files.filter((file) => !file.copied).map((file) => file.to).join(', ')}\n`);
    await runtime.fs.writeText(path.join(target, 'source.json'), `${JSON.stringify({ ledger: input.ledger, entries: input.entries.length, notes, complete, files })}\n`);
  } catch (error) {
    process.stderr.write(`ambicode stop: export failed, ${(error as Error).message}\n`);
  }
}

/** One exported file: `copied` holds only when the copy's hash equals the source's. */
async function exportFile(runtime: Runtime, from: string, target: string, name: string): Promise<{ from: string; to: string; present: boolean; bytes: number | null; hash: string | null; copied: boolean; error?: string }> {
  const bytes = await runtime.fs.readBytes(from).catch(() => null);
  if (bytes === null) return { from, to: name, present: false, bytes: null, hash: null, copied: false, error: 'missing' };
  const hash = contentHash(bytes);
  try {
    await runtime.fs.copyFile(from, path.join(target, name));
    const copy = contentHash(await runtime.fs.readBytes(path.join(target, name)));
    return { from, to: name, present: true, bytes: bytes.length, hash, copied: copy === hash, ...(copy === hash ? {} : { error: `copy hash ${copy}` }) };
  } catch (error) {
    return { from, to: name, present: true, bytes: bytes.length, hash, copied: false, error: (error as Error).message };
  }
}

/** The final message is what the user gets and what is saved, so a correction must restate the whole answer. */
function answerBlockReason(count: number, where: string, headless: boolean): string {
  const rewrite = 'write the whole answer again with the citations fixed; it replaces the previous one and is saved as the note';
  const head = `Your answer has ${count} citation problem(s); the full list is in ${where}.`;
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
