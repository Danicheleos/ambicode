import { readFile } from 'node:fs/promises';
import path, { isAbsolute, resolve, sep } from 'node:path';
import { projectForRequest } from '#modules/config/workspace';
import { find } from '#modules/search/declarations/refs';
import { loadConfigWithNotices } from '#modules/config/load';
import { splitAcs } from '#modules/requirements/envelope/acs';
import { envelopeSources } from '#modules/requirements/envelope/envelope';
import { buildChain, latestBound } from '#harness/engine/fold';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { saveNote } from '#modules/evidence/notes';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { AmbicodeError } from '#util/errors';
import { localTimestamp, uniqueFileExhausted, writeUniqueFile } from '#util/files';
import type { Runtime } from '#types/composition';
import type { LedgerEntry, LockedLedger, NoteDeps, TaskDir } from '#types/modules/evidence';
import type { RouteArgs, HandlerInput, HandlerResult } from '#types/harness';
import type { PlanCheckResult, BadAnchor } from '#types/modules/workers';

export const MAX_LISTED = 50;
type Find = (name: string) => Promise<readonly { path: string; line: number }[]>;

const PATH = '[\\w@./\\\\-]+\\.[A-Za-z0-9]+';
const SKIP_WORDS = /^(lines?|replace|import|export|const|function|return)$/i;
const NEW_VERB = /\b(new|add|adds|create|creates|introduce|introduces)\b/i;

export function planCheckFailed(r: PlanCheckResult): boolean {
  return r.anchors.badTotal > 0 || r.acs.unmappedTotal > 0;
}

function identifiers(line: string): string[] {
  // A span holding a path or an anchor names a file, not a symbol: `src/orders/stock.ts:1` must not yield `orders`.
  const spans = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '').filter((s) => !/[\\/]|:\d/.test(s));
  return spans.flatMap((s) => s.match(/[A-Za-z_][A-Za-z0-9_]{4,}/g) ?? []).filter((w) => !SKIP_WORDS.test(w));
}

const read = async (file: string): Promise<string[] | null> =>
  readFile(file, 'utf8').then((t) => t.split('\n'), () => null);

export async function checkPlan(input: { body: string; repositoryRoot: string; acIds: readonly string[];
  find: Find }): Promise<PlanCheckResult> {
  const lines = input.body.split('\n');
  const root = resolve(input.repositoryRoot);
  const files = new Map<string, string[] | null>();
  const bad: BadAnchor[] = [];
  let checked = 0, badTotal = 0, fence = false, headingPath: string | null = null;
  let ncLevel = 0;
  const mappedLines: string[] = [];
  const candidates = new Set<string>();

  const examine = async (path: string, spec: string, id: string | undefined): Promise<void> => {
    checked++;
    const [a, b = a] = spec.split(/[-–]/).map((s) => Number(s.replace(/\D/g, '')));
    const fail = (reason: BadAnchor['reason'], identifier?: string): void => {
      badTotal++;
      if (bad.length < MAX_LISTED) bad.push({ path, line: spec, reason, ...(identifier ? { identifier } : {}) });
    };
    const abs = resolve(root, path);
    if (isAbsolute(path) || path.split(/[\\/]/).includes('..') || !(abs + sep).startsWith(root + sep)) return fail('outside-repository');
    if (!files.has(abs)) files.set(abs, await read(abs));
    const src = files.get(abs);
    if (!src) return fail('missing-file');
    const count = src.at(-1) === '' ? src.length - 1 : src.length;
    if (!(a! >= 1 && a! <= b! && b! <= count)) return fail('line-out-of-range');
    if (id && !src.slice(Math.max(0, a! - 4), b! + 3).join('\n').includes(id)) fail('identifier-not-near', id);
  };

  for (const l of lines) {
    if (/^\s*```/.test(l)) { fence = !fence; continue; }
    if (fence) continue;
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) {
      const level = h[1]!.length;
      if (ncLevel && level <= ncLevel) ncLevel = 0;
      if (/Not covered/i.test(h[2]!)) ncLevel = level;
      headingPath = new RegExp(`(${PATH})`).exec(h[2]!)?.[1] ?? null;
    } else if (l.trimStart().startsWith('|') || ncLevel) mappedLines.push(l);
    const ids = identifiers(l);
    const code = [...l.matchAll(new RegExp(`(?<![\\w./-])(${PATH}):(\\d+(?:\\s*[-–]\\s*\\d+)?)`, 'g'))];
    for (const m of code) await examine(m[1]!, m[2]!.replace(/\s/g, ''), ids[0]);
    if (!h && !code.length && headingPath) {
      const p = /(?:\blines?\s+|(?:^|[\s`(])L)(\d+)(?:\s*[-–]\s*L?(\d+))?/.exec(l);
      if (p) await examine(headingPath, p[2] ? `${p[1]}-${p[2]}` : p[1]!, undefined);
    }
    if (NEW_VERB.test(l)) ids.forEach((w) => candidates.add(w));
  }

  const mappedText = mappedLines.join('\n');
  const named = (id: string): boolean => new RegExp(`(?<![\\w-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(mappedText);
  const unmappedAll = input.acIds.filter((id) => !named(id));
  const duplicates: PlanCheckResult['duplicates'] = [];
  for (const name of candidates) {
    if (duplicates.length >= MAX_LISTED) break;
    const hit = (await input.find(name))[0];
    if (hit) duplicates.push({ name, declaredAt: `${hit.path}:${hit.line}` });
  }
  return {
    anchors: { checked, bad, badTotal },
    acs: { mapped: input.acIds.length - unmappedAll.length, unmapped: unmappedAll.slice(0, MAX_LISTED), unmappedTotal: unmappedAll.length },
    duplicates,
  };
}

const LAST_ROUND = 'last automatic round: list anything you cannot fix under `## Known limitations`';

/** The acceptance unit ids of the route's latest envelope (step 04's `acs`); none without a captured requirement. */
async function acIdsOf(runtime: Runtime, dir: TaskDir, entries: readonly LedgerEntry[], head: LedgerEntry | undefined): Promise<string[]> {
  if (head === undefined) return [];
  const chain = buildChain(entries, head);
  const envelope = chain.entries.findLast((entry) => entry.kind === 'envelope');
  if (envelope === undefined) return [];
  const sources = await envelopeSources({ runtime, dir, args: (head['args'] ?? { text: '' }) as RouteArgs }, envelope);
  return sources.every((source) => source.relation === 'args') ? [] : splitAcs(sources).map((unit) => unit.id);
}

/** Step 05's `find` on the project ground used: the args' project, else the bound `project-ambiguous` answer. */
async function finderOf(runtime: Runtime, dir: TaskDir, entries: readonly LedgerEntry[], head: LedgerEntry | undefined): Promise<{ find: Find; skipped: string | null }> {
  try {
    const { config } = await loadConfigWithNotices(runtime.fs, dir.repositoryRoot);
    const answered = head === undefined ? null : latestBound(buildChain(entries, head).entries, 'project-ambiguous');
    const requested = ((head?.['args'] ?? {}) as Partial<RouteArgs>).project ?? (answered !== null && answered['answer'] !== 'stop' ? String(answered['answer']) : null);
    const project = projectForRequest(config, requested, []);
    return { find: async (name) => (await find(runtime, name, { project, kind: null })).declarations.map((row) => ({ path: row.path, line: row.line ?? 0 })), skipped: null };
  } catch (error) {
    if (error instanceof AmbicodeError) return { find: async () => [], skipped: `${error.code}: ${error.message}` };
    throw error;
  }
}

/** Checks a saved draft, writes the artifact, then the `worker` entry; a throw leaves no `worker` entry (06-P2). */
async function checkDraft(deps: NoteDeps & { ledger: LockedLedger }, task: string, draft: LedgerEntry): Promise<{ worker: LedgerEntry; result: PlanCheckResult; artifact: string }> {
  const { runtime, ledger } = deps;
  const started = runtime.clock.now().getTime();
  const dir = await resolveTaskDir(runtime, task);
  const read = await ledger.read();
  const entries = read.state === 'ok' ? read.entries : [];
  const route = typeof draft['route'] === 'string' ? draft['route'] : undefined;
  const head = entries.find((entry) => entry.kind === 'route' && entry.id === route);
  const body = await runtime.fs.readText(path.join(dir.repositoryRoot, String(draft['path'])));
  const finder = await finderOf(runtime, dir, entries, head);
  const checked = await checkPlan({ body, repositoryRoot: dir.repositoryRoot, acIds: await acIdsOf(runtime, dir, entries, head), find: finder.find });
  const result: PlanCheckResult = finder.skipped === null ? checked : { ...checked, duplicatesSkipped: finder.skipped };
  await runtime.fs.mkdirp(dir.workers);
  const file = await writeUniqueFile(runtime.fs, path.join(dir.workers, `plan-check-${localTimestamp(runtime.clock.now())}`), '.json', `${JSON.stringify(result, null, 2)}\n`);
  if (file === null) throw uniqueFileExhausted('plan-check');
  const artifact = path.relative(dir.repositoryRoot, file).split(path.sep).join('/');
  const summary = { failed: planCheckFailed(result), anchorsBad: result.anchors.badTotal, acsUnmapped: result.acs.unmappedTotal, duplicates: result.duplicates.length };
  const worker = await ledger.append({ kind: 'worker', worker: 'plan-check', outcome: 'ran', ms: runtime.clock.now().getTime() - started, artifact, summary, ...(route === undefined ? {} : { route }) });
  return { worker, result, artifact };
}

/** `plan check`: the draft is saved, under the 02-N4 ownership check, before the checker starts (06-P2, 06-P3). */
export async function runPlanCheck(deps: NoteDeps, input: { task: string; body: string | null; from: string | null }): Promise<{ draft: LedgerEntry; worker: LedgerEntry; result: PlanCheckResult; artifact: string }> {
  const work = async (ledger: LockedLedger) => {
    const saved = await saveNote({ ...deps, ledger }, { task: input.task, kind: 'plan-draft', body: input.body, from: input.from, iteration: null });
    return { draft: saved.entry, ...(await checkDraft({ ...deps, ledger }, input.task, saved.entry)) };
  };
  if (deps.ledger !== undefined) return work(deps.ledger);
  const dir = await resolveTaskDir(deps.runtime, input.task);
  return withLedgerLock(deps.runtime.fs, dir.root, () => deps.runtime.clock.now(), deps.session ?? deps.runtime.ids.writerId(), work);
}

/** The revise sections' share of the re-printed plan-write step, which stays within 3,072 bytes (01-contracts §8). */
const INLINE_SECTION_BYTES = 1_400;

const bytes = (text: string): number => Buffer.byteLength(text);

const listed = (bad: readonly BadAnchor[]): string[] => bad.map((anchor) => `${anchor.path}:${anchor.line} ${anchor.reason}${anchor.identifier === undefined ? '' : ` (${anchor.identifier})`}`);

/** The `plan-check` code step: consumes what `plan check` just wrote, else checks the latest draft; a failing check asks for another write (06-P5–P7). */
export async function planCheckStep(input: HandlerInput): Promise<HandlerResult> {
  const window = await input.context.window(input.view, input.raisedBy);
  let worker = window.findLast((entry) => entry.kind === 'worker' && entry['worker'] === 'plan-check' && input.produced.includes(entry.id));
  if (worker === undefined) {
    const draft = window.findLast((entry) => entry.kind === 'note' && entry['note'] === 'plan-draft');
    if (draft === undefined) return { state: 'failed', code: 'plan-draft-missing', message: `Task ${input.view.task} has no plan draft to check.`, recoverable: false };
    try {
      worker = (await checkDraft({ runtime: input.runtime, session: input.view.session, context: input.context, ledger: input.ledger }, input.view.task, draft)).worker;
    } catch (error) {
      if (error instanceof AmbicodeError) return { state: 'failed', code: error.code, message: error.message, recoverable: false };
      throw error;
    }
  }
  const summary = worker['summary'] as { failed: boolean; anchorsBad: number; acsUnmapped: number } | undefined;
  if (summary?.failed !== true) return { state: 'ok', payload: null };
  const dir = await resolveTaskDir(input.runtime, input.view.task);
  const result = JSON.parse(await input.runtime.fs.readText(path.join(dir.repositoryRoot, String(worker['artifact'])))) as PlanCheckResult;
  const artifact = String(worker['artifact']);
  const lists: [string, string[], number][] = [['Bad anchors', listed(result.anchors.bad), result.anchors.badTotal], ['Unmapped acceptance units', result.acs.unmapped, result.acs.unmappedTotal]];
  const args: Record<string, string[]> = {};
  // The engine renders each key as `## key\n…` joined by blank lines; the Last round section may follow.
  const pointer = (total: number, kept: number) => `… ${total - kept} more in ${artifact}`;
  const shown = lists.filter(([, , total]) => total > 0);
  let left = INLINE_SECTION_BYTES - bytes(`\n\n## Last round\n${LAST_ROUND}`)
    - shown.reduce((sum, [key, , total]) => sum + bytes(`\n\n## ${key}\n`) + bytes(`\n${pointer(total, 0)}`), 0);
  for (const [key, items, total] of shown) {
    const kept: string[] = [];
    for (const item of items) {
      if (bytes(item) + 1 > left) break;
      kept.push(item);
      left -= bytes(item) + 1;
    }
    args[key] = kept.length < total ? [...kept, pointer(total, kept.length)] : kept;
  }
  return {
    state: 'failed',
    code: 'plan-check-failed',
    message: `plan check: ${summary.anchorsBad} bad anchors, ${summary.acsUnmapped} unmapped acceptance units (${artifact}).`,
    recoverable: true,
    revise: { args, lastRound: LAST_ROUND },
  };
}
