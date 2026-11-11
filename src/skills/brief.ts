import path from 'node:path';
import { doneIterations, iterationHeadings, level2Starts, sectionEnd } from '#modules/evidence/task/iterations';
import { TASK_PATH } from '#modules/evidence/task/slug';
import { TASKS_DIR } from '#types/defaults';
import { planBodyOf } from '#modules/evidence/notes';
import type { LedgerEntry } from '#types/modules/evidence';
import type { HandlerInput } from '#types/harness';
import { toPosix } from '#util/glob';

/**
 * The plan a task implements, its iteration count, and the brief from the iteration it starts at. An unnamed start briefs
 * every iteration not done, in order, through the last (`through`); a named one briefs itself, or up to `through` for the review pin.
 * Every brief opens with the plan's header (before the first iteration: goal, requirements, decisions) and closes with every other level-2 section after the first iteration.
 */
export async function briefOf(input: HandlerInput, entries: readonly LedgerEntry[], through?: number): Promise<{ planPath: string | null; iteration: number; iterations: number; through: number; brief: string | null }> {
  const planPath = input.args.plan ?? (entries.findLast((entry) => entry.kind === 'note' && entry['note'] === 'plan')?.['path'] as string | undefined) ?? null;
  const plan = planPath === null ? null : await input.runtime.fs.readText(path.resolve(input.dir.repositoryRoot, planPath)).catch(() => null);
  const done = doneIterations(entries);
  const named = input.args.iteration;
  const headings = plan === null ? [] : iterationHeadings(plan);
  // Without iteration headings the request is the one brief, and it may run again.
  let iteration = named ?? 1;
  while (named === null && headings.length > 0 && done.has(iteration)) iteration += 1;
  const iterations = Math.max(1, headings.length);
  const last = named === null ? iterations : Math.max(iteration, through ?? iteration);
  const sections: string[] = [];
  if (plan !== null && headings.length === 0) sections.push(plan);
  else if (plan !== null) {
    // An iteration ends at the next level-2 heading of any kind: `## Assumptions` after the last one is the plan's, not that iteration's.
    const level2 = level2Starts(plan);
    const endOf = (start: number): number => sectionEnd(plan, start, level2);
    // Every other level-2 section after the first iteration is the plan's, wherever it sits: `## Assumptions` between two iterations reaches each brief.
    const iterationAt = new Set(headings.map((heading) => heading.index));
    const closing = level2.filter((at) => at > headings[0]!.index && !iterationAt.has(at)).map((at) => plan.slice(at, endOf(at)).trim()).join('\n\n');
    const header = planBodyOf(plan.slice(0, headings[0]!.index)).trim();
    const own: string[] = [];
    for (let number = iteration; number <= last; number += 1) {
      if (named === null && done.has(number)) continue;
      const at = headings.find((heading) => heading.number === number);
      if (at !== undefined) own.push(plan.slice(at.index, endOf(at.index)).trim());
    }
    if (own.length > 0) sections.push(...[header, ...own, closing].filter((part) => part !== ''));
  }
  return { planPath, iteration, iterations, through: last, brief: sections.length === 0 ? null : sections.join('\n\n').trim() };
}

/** The investigation file a request names by path (the file, or a task folder: its latest), if it sits under the tasks directory. */
async function namedInvestigation(input: HandlerInput): Promise<string | null> {
  const { fs } = input.runtime;
  const root = input.dir.repositoryRoot;
  for (const word of input.args.text.split(/\s+/)) {
    const token = word.replace(/^["'`(]+|["'`).,;:]+$/g, '');
    const hit = TASK_PATH.exec(token);
    if (hit === null) continue;
    const end = hit.index + hit[0].length;
    const folder = path.resolve(root, token.slice(0, end));
    const rest = token.slice(end);
    if (/^[\\/]investigation_[^\\/]+\.md$/.test(rest)) return path.join(folder, rest);
    if (/^[\\/]?$/.test(rest)) {
      const latest = (await fs.readdir(folder).catch(() => [])).map((entry) => entry.name).filter((name) => /^investigation_.*\.md$/.test(name)).sort().at(-1);
      if (latest !== undefined) return path.join(folder, latest);
    }
  }
  return null;
}

/** The note a plan or task builds on: the investigation the request names by path, else the latest one saved on this task. */
export async function investigationOf(input: HandlerInput, entries: readonly LedgerEntry[]): Promise<{ path: string; text: string } | null> {
  const root = input.dir.repositoryRoot;
  const saved = entries.findLast((entry) => entry.kind === 'note' && entry['note'] === 'investigation')?.['path'];
  const file = (await namedInvestigation(input)) ?? (typeof saved === 'string' ? path.resolve(root, saved) : null);
  const inside = file !== null && !path.relative(path.join(root, TASKS_DIR), file).startsWith('..');
  const text = inside ? await input.runtime.fs.readText(file).catch(() => null) : null;
  return text === null ? null : { path: toPosix(path.relative(root, file!)), text };
}
