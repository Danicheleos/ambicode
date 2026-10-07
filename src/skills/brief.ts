import path from 'node:path';
import type { LedgerEntry } from '#types/modules/evidence';
import type { HandlerInput } from '#types/harness';

const ITERATION = /^##\s+Iteration\s+(\d+)\b.*$/gim;

/** The plan a task implements, its iteration count, and the brief of the iteration it starts at. */
export async function briefOf(input: HandlerInput, entries: readonly LedgerEntry[]): Promise<{ planPath: string | null; iteration: number; iterations: number; brief: string | null }> {
  const planPath = input.args.plan ?? (entries.findLast((entry) => entry.kind === 'note' && entry['note'] === 'plan')?.['path'] as string | undefined) ?? null;
  const plan = planPath === null ? null : await input.runtime.fs.readText(path.resolve(input.dir.repositoryRoot, planPath)).catch(() => null);
  const done = entries.findLast((entry) => entry.kind === 'note' && entry['note'] === 'notes' && typeof entry['iteration'] === 'number')?.['iteration'] as number | undefined;
  const iteration = (done ?? 0) + 1;
  const headings = plan === null ? [] : [...plan.matchAll(ITERATION)];
  const at = headings.findIndex((heading) => Number(heading[1]) === iteration);
  const brief = plan === null ? null : headings.length === 0 ? plan : at < 0 ? null : plan.slice(headings[at]!.index, headings[at + 1]?.index ?? plan.length);
  return { planPath, iteration, iterations: Math.max(1, headings.length), brief: brief?.trim() ?? null };
}

/** The text a plan or task map is seeded from: the latest investigation note for a plan, the iteration brief for a task. */
export async function seedTextOf(input: HandlerInput, entries: readonly LedgerEntry[]): Promise<string | null> {
  if (input.view.skill === 'task') return (await briefOf(input, entries)).brief?.replace(/^##\s+Iteration\s+\d+.*\n?/i, '') ?? null;
  if (input.view.skill !== 'plan') return null;
  const note = entries.findLast((entry) => entry.kind === 'note' && entry['note'] === 'investigation');
  return typeof note?.['path'] === 'string' ? input.runtime.fs.readText(path.resolve(input.dir.repositoryRoot, note['path'])).catch(() => null) : null;
}
