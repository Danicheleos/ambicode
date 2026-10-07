import path from 'node:path';
import { TASKS_DIR } from '#types/defaults';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { readLedgerStrict } from '#platform/ledger/ledger';
import { buildChain, exitOf, foldRoute } from './fold.ts';
import { harnessOf } from '../session/harness.ts';
import { harnessEnded } from '../session/rebind.ts';
import { canonicalArgs, parseAnswerFlag } from '../definition/flags.ts';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { Answer, RouteArgs, RouteDef } from '#types/harness';

export type ReopenRule = 'task' | 'session' | 'session-end' | 'adopt';

export interface Reopen { task: string; rule: ReopenRule }

const heads = (entries: readonly LedgerEntry[], skill: string): LedgerEntry[] => {
  const resumed = new Set(entries.filter((entry) => entry.kind === 'route' && typeof entry['resumes'] === 'string').map((entry) => entry['resumes'] as string));
  return entries.filter((entry) => entry.kind === 'route' && entry['skill'] === skill && !resumed.has(entry.id));
};

/** A route whose session wrote `session{end}`: nobody is working in it any more. */
export const sessionEnded = (entries: readonly LedgerEntry[], head: LedgerEntry): boolean => {
  const harness = harnessOf(head);
  return entries.some((entry) => entry.kind === 'session' && entry['event'] === 'end' && entry['route'] === head.id) || (harness !== null && harnessEnded(entries, harness));
};

const reopenable = (entries: readonly LedgerEntry[], head: LedgerEntry): boolean => {
  const ended = exitOf(buildChain(entries, head));
  return ended !== null && ended['reason'] !== 'superseded';
};

/** The latest finished chain of the skill that the rule lets a start continue; superseded chains were replaced, never finished. */
export function reopenHead(entries: readonly LedgerEntry[], skill: string, rule: ReopenRule, session: string): LedgerEntry | null {
  const candidates = heads(entries, skill).filter((head) => reopenable(entries, head));
  switch (rule) {
    case 'task': return candidates.filter((head) => head['session'] === session || sessionEnded(entries, head)).at(-1) ?? null;
    case 'adopt': return candidates.at(-1) ?? null;
    case 'session': return candidates.filter((head) => head['session'] === session).at(-1) ?? null;
    case 'session-end': return candidates.filter((head) => sessionEnded(entries, head)).at(-1) ?? null;
  }
}

/** The task of the session's latest route over all tasks, with that route's skill and owner; `by` names the session field matched. */
export async function sessionLatest(runtime: Runtime, root: string, session: string, by: 'session' | 'harnessSession' = 'session'): Promise<{ task: string; skill: string; owner: string } | null> {
  const found: { task: string; at: string; id: string; skill: string; owner: string }[] = [];
  for (const entry of await runtime.fs.readdir(path.join(root, TASKS_DIR)).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const dir = await resolveTaskDir(runtime, entry.name).catch(() => null);
    if (dir === null) continue;
    const read = await readLedgerStrict(runtime.fs, dir.root).catch(() => null);
    if (read === null || read.state !== 'ok') continue;
    const all: readonly LedgerEntry[] = read.entries;
    const own = all.findLast((candidate) => candidate.kind === 'route' && candidate[by] === session);
    if (own !== undefined) found.push({ task: entry.name, at: own.at, id: own.id, skill: String(own['skill']), owner: String(own['session']) });
  }
  const best = found.sort((left, right) => (left.at === right.at ? left.id.localeCompare(right.id) : left.at.localeCompare(right.at))).at(-1) ?? null;
  return best === null ? null : { task: best.task, skill: best.skill, owner: best.owner };
}

/**
 * Which finished route a (re)started skill continues, in order: an explicit `--task`; the session's latest route;
 * the slug's route after its session ended, or any with `--adopt`. `null` starts a new route.
 */
export async function resolveReopen(
  runtime: Runtime,
  input: { skill: string; session: string; repositoryRoot: string; task?: string; slug: string; adopt: boolean; fresh: boolean },
  entriesOf: (task: string) => Promise<readonly LedgerEntry[]>,
): Promise<Reopen | null> {
  if (input.fresh) return null;
  if (input.task !== undefined) return reopenHead(await entriesOf(input.task), input.skill, 'task', input.session) === null ? null : { task: input.task, rule: 'task' };
  const latest = await sessionLatest(runtime, input.repositoryRoot, input.session);
  if (latest !== null && latest.skill === input.skill) {
    const entries = await entriesOf(latest.task);
    const head = reopenHead(entries, input.skill, 'session', input.session);
    // A paused route takes any re-type; a finished one only a re-type that names the same task, else it is new work.
    if (head !== null && (exitOf(buildChain(entries, head))?.['complete'] !== true || latest.task === input.slug)) return { task: latest.task, rule: 'session' };
  }
  const entries = await entriesOf(input.slug);
  if (input.adopt && reopenHead(entries, input.skill, 'adopt', input.session) !== null) return { task: input.slug, rule: 'adopt' };
  return reopenHead(entries, input.skill, 'session-end', input.session) === null ? null : { task: input.slug, rule: 'session-end' };
}

/**
 * The step the reopen restarts from: the first one when the context changed (everything reads it); otherwise the
 * step that ended the route, the last step of a completed one.
 */
export function reopenFrom(def: RouteDef, entries: readonly LedgerEntry[], head: LedgerEntry, changed: boolean): string {
  if (changed) return def.steps[0]!.id;
  const chain = buildChain(entries, head);
  const ended = exitOf(chain);
  if (ended === null || ended['complete'] === true) return (foldRoute(def, chain).position ?? def.steps.at(-1)!).id;
  const before = chain.entries.slice(0, chain.entries.indexOf(ended));
  for (const entry of before.toReversed()) {
    const id = entry.kind === 'step' ? entry['step'] : entry.kind === 'gate' || entry.kind === 'acceptance' || entry.kind === 'declined' || entry.kind === 'default-taken' ? entry['gate'] : null;
    const step = def.steps.find((candidate) => candidate.id === id || (entry.kind !== 'step' && candidate.gate?.id === id));
    if (step !== undefined) return step.id;
  }
  return (foldRoute(def, chain).position ?? def.steps.at(-1)!).id;
}

/** The old arguments with the new text, requirements and flags added to them. */
export function mergeArgs(old: RouteArgs, add: { text: string; requirements: readonly string[]; project: string | null; plan: string | null; fromDraft: string | null; answers: readonly Answer[]; headless: boolean; target?: RouteArgs['target'] }): Parameters<typeof canonicalArgs>[0] {
  const text = [old.text, add.text].map((part) => part.trim()).filter((part, index, all) => part !== '' && all.indexOf(part) === index).join('\n\n');
  const answers = [...(old.answers ?? []).map(parseAnswerFlag), ...add.answers];
  const target = add.target ?? old.target;
  return {
    text,
    requirements: [...old.requirements, ...add.requirements],
    project: add.project ?? old.project,
    plan: add.plan ?? old.plan,
    fromDraft: add.fromDraft ?? old.fromDraft,
    answers: answers.filter((answer, index) => answers.findIndex((other) => other.gate === answer.gate && other.option === answer.option) === index),
    headless: add.headless,
    hasRequirement: false,
    ...(target === undefined ? {} : { target }),
  };
}
