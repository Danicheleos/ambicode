import { open } from 'node:fs/promises';
import path from 'node:path';
import { findSessionRepository } from '../../composition/session-repository.ts';
import type { Runtime } from '../../composition/root.ts';
import type { HookInput, StopHookOutput } from '../../contracts/hook.ts';
import { resolveActiveRoute } from '../../route/active-route.ts';
import { buildChain, currentIn, isBoundAnswer, isGreen } from '../../route/fold.ts';
import { harnessOf } from '../../route/harness.ts';
import type { RouteDef } from '../../route/routes.ts';
import type { LedgerEntry } from '../../task/ledger.ts';
import { readLedger } from '../../task/ledger.ts';
import { withLedgerLock } from '../../task/ledger-lock.ts';
import { buildReport } from '../../task/report.ts';
import { NOTE_LABELS } from '../../task/notes.ts';
import { taskDirFor } from '../../task/task-dir.ts';
import { hookStateBaseDir, readStopCursor, writeStopCursor } from '../session/markers.ts';
import type { RouteHookDeps } from './prompt-launch.ts';

export const TRANSCRIPT_TAIL_BYTES = 1_048_576;
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

const squash = (value: string): string => value.replace(/\s+/g, ' ').trim();
const firstHeading = (instruction: string | null): string | null => instruction?.split('\n').find((line) => /^#+\s/.test(line))?.trim() ?? null;
const firstLine = (text: string): string => text.split('\n').find((line) => line.trim() !== '')?.trim() ?? '';

interface Checked { chain: readonly LedgerEntry[]; def: RouteDef; root: string; text: string; defectBrief: boolean }

async function problemsOf(input: Checked, runtime: Runtime): Promise<string[]> {
  const problems: string[] = [];
  const { text, root } = input;
  for (const match of text.matchAll(/(?<![\w:/])((?:\/|[\w.-]+\/)?[\w./-]*[\w-]\.[A-Za-z][A-Za-z0-9]*):(\d+)(?:-(\d+))?/g)) {
    if (match[0].includes('://')) continue;
    const file = path.isAbsolute(match[1]!) ? match[1]! : path.join(root, match[1]!);
    if (path.relative(root, file).startsWith('..')) continue;
    const last = Number(match[3] ?? match[2]);
    try {
      const lines = (await runtime.fs.readText(file)).split('\n').length - (/\n$/.test(await runtime.fs.readText(file)) ? 1 : 0);
      if (last > lines) problems.push(`${match[0]}: ${path.relative(root, file)} has ${lines} lines.`);
    } catch {
      problems.push(`${match[0]}: ${path.relative(root, file)} does not exist.`);
    }
  }
  if (/(^|\n)Evidence\b/.test(text) && /Not verified/.test(text)) {
    const report = buildReport(input.chain, { current: currentIn(input.def, buildChain(input.chain, input.chain.find((entry) => entry.kind === 'route')!)) });
    const block = squash(text);
    if (!block.includes(squash(report.evidence)) || !block.includes(squash(report.notVerified))) problems.push('The Evidence or Not verified block differs from the generated one: copy it from the report command.');
    const hash = /<!-- ambicode report (\S+) -->/.exec(text)?.[1];
    if (hash !== undefined && hash !== report.hash) problems.push('The report hash comment does not match the generated report.');
  }
  if (/\b(accepted|approved)\b/i.test(NOTE_LABELS.reduce((rest, label) => rest.replaceAll(label, ''), text)) && !input.chain.some((entry) => entry.kind === 'acceptance' && isBoundAnswer(entry))) problems.push('The text says accepted or approved; no bound acceptance is recorded.');
  if (/\b(all )?tests? pass(?:ed|es)?\b/i.test(text) && !input.chain.some(isGreen)) problems.push('The text says tests pass; no check with exit 0, a test count and no failures is recorded.');
  if (input.defectBrief) {
    for (const key of new Set(input.chain.filter(isGreen).map((entry) => String(entry['key'])))) if (!redBeforeGreen(input.chain, key)) problems.push(`${key}: no failing run precedes the first green one.`);
  }
  return problems;
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
    let text: string | null = null;
    let unreadable = false;
    if (savedNote !== undefined && typeof savedNote['path'] === 'string') {
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
    if (unreadable) await finish({ which: 'stop-unreadable', count: 1 });
    else if (text !== null && !chain.some((entry) => entry.kind === 'limit' && entry['which'] === 'stop-block')) {
      const problems = await problemsOf({ chain, def, root, text, defectBrief: options.defectBrief === true }, runtime);
      if (problems.length > 0) {
        await runtime.fs.mkdirp(dir.root);
        await runtime.fs.writeText(dir.stopCheck, `# Stop check\n\n${problems.map((item) => `- ${item}`).join('\n')}\n`);
        let reason = `The text you are about to finish with has ${problems.length} problem(s). Fix them, or state them; the full list is in ${path.relative(root, dir.stopCheck)}:`;
        for (const item of problems) {
          if (Buffer.byteLength(`${reason}\n- ${item}`) > REASON_LIMIT_BYTES) break;
          reason += `\n- ${item}`;
        }
        await finish({ which: 'stop-block', count: problems.length });
        output = { decision: 'block', reason };
      }
    }
    const after = await readLedger(runtime.fs, dir.root);
    await writeStopCursor(runtime.fs, base, target.routeId, buildChain(after, head).entries.length);
    return output;
  } finally {
    if (active === null) await deps.pointer.clearEnded(session, scratchpad);
  }
}
