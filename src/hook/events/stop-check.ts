import { open } from 'node:fs/promises';
import path from 'node:path';
import { findSessionRepository } from '#platform/git/session-repository';
import { createRuntime } from '#composition/root';
import { openRepository } from '#platform/git/open';
import type { HookInput, StopHookOutput, RouteHookDeps } from '#types/hook';
import { resolveActiveRoute } from '#harness/session/active-route';
import { buildChain, currentIn, foldRoute, isBoundAnswer, isGreen, windowOf } from '#harness/engine/fold';
import { ReviewResult } from '#types/modules/review';
import { containsBlock, notCoveredBlock } from '#modules/review/bundle/coverage-block';
import { harnessOf } from '#harness/session/harness';
import { readLedger } from '#platform/ledger/ledger';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { buildReport } from '#modules/evidence/report/report';
import { navigationLine } from '#modules/evidence/report/navigation-line';
import { NOTE_LABELS, saveNote } from '#modules/evidence/notes';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import { hookStateBaseDir, readStopCursor, writeStopCursor } from '#platform/claude/hook-state';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { RouteDef } from '#types/harness';

export const TRANSCRIPT_TAIL_BYTES = 1024 * 1024;
export const REASON_LIMIT_BYTES = 2048;

/** A failing check precedes the first green one of the key: the defect was shown before it was fixed (03-K4). */
export function redBeforeGreen(entries: readonly LedgerEntry[], key: string): boolean {
  const runs = entries.filter((entry) => entry.kind === 'check' && entry['key'] === key);
  const green = runs.findIndex(isGreen);
  if (green < 0) return true;
  return runs.slice(0, green).some((run) => run['exit'] !== 0 && ((run['summary'] as { failed?: number } | null)?.failed ?? 0) >= 1);
}

/** The text of the last assistant turn, read from the end of the transcript; null when it cannot be read (03-K6). */
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

interface Checked { chain: readonly LedgerEntry[]; def: RouteDef; root: string; text: string; defectBrief: boolean; files: () => Promise<readonly string[]>; citationsOnly?: boolean }

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
  if (/(^|\n)Evidence\b/.test(text) && /Not verified/.test(text)) {
    const report = buildReport(input.chain, { current: currentIn(input.def, buildChain(input.chain, input.chain.find((entry) => entry.kind === 'route')!)) });
    const block = squash(text);
    if (!block.includes(squash(report.evidence)) || !block.includes(squash(report.notVerified))) problems.push('The Evidence or Not verified block differs from the generated one: copy it from the report command.');
    const hash = /<!-- ambicode report (\S+) -->/.exec(text)?.[1];
    if (hash !== undefined && hash !== report.hash) problems.push('The report hash comment does not match the generated report.');
  }
  if (/\b(accepted|approved)\b/i.test(NOTE_LABELS.reduce((rest, label) => rest.replaceAll(label, ''), text)) && !input.chain.some((entry) => entry.kind === 'acceptance' && isBoundAnswer(entry))) problems.push('The text says accepted or approved; no bound acceptance is recorded.');
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

/** A final message presenting the doctor table must carry the same cells as `steps/doctor.md`, however it is laid out (09-D5). */
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

/** Review route (08-C3): once its review ran, the final message must carry part 4 of that review's report verbatim. */
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

/** Stop's three conditions, the checks they run, and the single block they may cause (03-K1 … 03-K7). */
export async function stopCheck(runtime: Runtime, input: HookInput, deps: RouteHookDeps, options: { defectBrief?: boolean } = {}): Promise<StopHookOutput | null> {
  if (input.agent_id !== undefined) return null;
  const found = await findSessionRepository(runtime, input.cwd ?? runtime.cwd);
  if (typeof found === 'string') return null;
  const [session, scratchpad] = [input.session_id, input.scratchpad_dir];
  const root = found.repositoryRoot;
  const base = hookStateBaseDir(runtime.fs, session, scratchpad);

  const active = await resolveActiveRoute(runtime.fs, deps.pointer, { repositoryRoot: root, session, scratchpad, scan: false });
  const ended = active === null ? await deps.pointer.readEnded(session, scratchpad) : null;
  const target = active ?? (ended === null ? null : { task: ended.task, skill: ended.skill, routeId: ended.routeId });
  if (target === null) return null;

  try {
    const dir = taskDirFor(root, target.task);
    const entries = await readLedger(runtime.fs, dir.root);
    const head = entries.find((entry) => entry.kind === 'route' && entry.id === target.routeId && harnessOf(entry) === session);
    const def = deps.routes.route(target.skill);
    if (head === undefined || def === null) return null;
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
      (listed ??= createRuntime({ ...runtime, cwd: root })
        .then(openRepository)
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
      if (limit === null) return;
      await withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), session, (ledger) => ledger.append({ kind: 'limit', route: target.routeId, ...limit }));
    };
    const missingBlock = unreadable || blockedBefore ? null : await coverageBlockMissing(runtime, { root, def, chain, head, ended: active === null || exited, transcript: input.transcript_path });
    if (unreadable) await finish({ which: 'stop-unreadable', count: 1 });
    else if ((text !== null || missingBlock !== null) && !blockedBefore) {
      // The task route's ground step records a defect brief (07-S2).
      const defectBrief = options.defectBrief ?? chain.some((entry) => entry.kind === 'step' && entry['defectBrief'] === true);
      const problems = text === null ? [] : await problemsOf({ chain, def, root, text, defectBrief, files, citationsOnly: saveAnswer }, runtime);
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
    if (saveAnswer && text !== null && answering !== null) await saveAsNote({ runtime, root, task: target.task, head, chain, text, kind: answering, deps, scratchpad });
    const after = await readLedger(runtime.fs, dir.root);
    await writeStopCursor(runtime.fs, base, target.routeId, buildChain(after, head).entries.length);
    if (saveAnswer) await deps.pointer.clearEnded(session, scratchpad);
    return output;
  } finally {
    if (active === null) await deps.pointer.clearEnded(session, scratchpad);
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
 * under the route's owner, not the Claude session, and the engine takes the ledger lock only after the note's is released.
 */
async function saveAsNote(input: { runtime: Runtime; root: string; task: string; head: LedgerEntry; chain: readonly LedgerEntry[]; text: string; kind: RouteDef['steps'][number]; deps: RouteHookDeps; scratchpad: string | undefined }): Promise<void> {
  const owner = String(input.head['session']);
  const kind = input.kind.produces.find((produced) => produced.kind === 'note')?.value;
  if (kind === null || kind === undefined) return;
  const routeRuntime = await createRuntime({ ...input.runtime, cwd: input.root });
  const body = `${input.text.trimEnd()}\n\n${navigationLine(input.chain)}\n`;
  await saveNote({ runtime: routeRuntime, session: owner, context: null }, { task: input.task, kind: kind as Parameters<typeof saveNote>[1]['kind'], body, from: null, iteration: null, route: input.head.id });
  await input.deps.engine.advance({ task: input.task, session: owner, cause: 'note save', ...(input.scratchpad === undefined ? {} : { scratchpadDir: input.scratchpad }) });
}
