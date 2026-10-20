import path from 'node:path';
import { ITERATION_HEADING, doneIterations } from '#modules/evidence/task/iterations';
import { TASK_PATH } from '#modules/evidence/task/slug';
import { TASKS_DIR } from '#types/defaults';
import type { LedgerEntry } from '#types/modules/evidence';
import type { HandlerInput } from '#types/harness';

/** The plan a task implements, its iteration count, and the brief of the iteration it starts at. */
export async function briefOf(input: HandlerInput, entries: readonly LedgerEntry[]): Promise<{ planPath: string | null; iteration: number; iterations: number; brief: string | null }> {
  const planPath = input.args.plan ?? (entries.findLast((entry) => entry.kind === 'note' && entry['note'] === 'plan')?.['path'] as string | undefined) ?? null;
  const plan = planPath === null ? null : await input.runtime.fs.readText(path.resolve(input.dir.repositoryRoot, planPath)).catch(() => null);
  const done = doneIterations(entries);
  const named = input.args.iteration;
  const headings = plan === null ? [] : [...plan.matchAll(ITERATION_HEADING)];
  // Without iteration headings the request is the one brief, and it may run again.
  let iteration = named ?? 1;
  while (named === null && headings.length > 0 && done.has(iteration)) iteration += 1;
  const at = headings.findIndex((heading) => Number(heading[1]) === iteration);
  const brief = plan === null ? null : headings.length === 0 ? plan : at < 0 ? null : plan.slice(headings[at]!.index, headings[at + 1]?.index ?? plan.length);
  return { planPath, iteration, iterations: Math.max(1, headings.length), brief: brief?.trim() ?? null };
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
  return text === null ? null : { path: path.relative(root, file!).split(path.sep).join('/'), text };
}
