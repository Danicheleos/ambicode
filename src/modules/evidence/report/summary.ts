import { buildReport } from './report.ts';
import type { LedgerEntry } from '#types/modules/evidence';

/** The task's state at a glance, from the ledger alone; the evidence and gap lines are the report's own. */
export function renderSummary(task: string, entries: readonly LedgerEntry[]): string {
  const routes = entries.filter((entry) => entry.kind === 'route');
  const endOf = (id: unknown): string => {
    const exit = entries.findLast((entry) => entry.kind === 'exit' && entry['route'] === id);
    return exit === undefined ? 'open' : `${exit['reason']}${typeof exit['detail'] === 'string' ? ` (${exit['detail']})` : ''}`;
  };
  const request = String((routes[0]?.['args'] as { text?: unknown } | undefined)?.text ?? '').trim();
  const keys = [...new Set(entries.filter((entry) => entry.kind === 'envelope').flatMap((entry) => (Array.isArray(entry['sources']) ? entry['sources'] : []).map((source: { key?: unknown }) => String(source.key))))];
  const planned = routes.map((route) => (route['args'] as { plan: string | null }).plan).findLast((file) => file !== null);
  const plan = entries.findLast((entry) => entry.kind === 'note' && entry['note'] === 'plan')?.['path'] ?? planned ?? 'none';
  const iterations = entries.filter((entry) => entry.kind === 'step' && entry['step'] === 'start' && entry['iteration'] !== undefined);
  const report = buildReport(entries);
  return [
    `# Task ${task}`,
    '',
    `Request: ${request === '' ? '(none)' : request}`,
    ...(keys.length === 0 ? [] : [`Requirement: ${keys.join(', ')}`]),
    `Plan: ${String(plan)}`,
    '',
    '## Routes',
    ...routes.map((route) => `- ${route['skill']} · ${route.at} · ${endOf(route.id)}`),
    ...(iterations.length === 0 ? [] : ['', '## Iterations', ...iterations.map((start) => `- Iteration ${start['iteration']} of ${start['iterations']}: ${endOf(start['route'])}`)]),
    '',
    `## ${report.evidence}`,
    '',
    `## ${report.notVerified}`,
    '',
  ].join('\n');
}
