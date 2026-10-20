import { buildChain, exitOf } from '#modules/evidence/ledger-chain';
import { checkFacts, gapsOf, reviewFact } from './report.ts';
import type { Chain, LedgerEntry } from '#types/modules/evidence';

const MAX_QUOTED = 2000;
const WORK = ['check', 'review', 'note'];

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const quote = (body: string, file: string): string[] => {
  const cut = body.trimEnd().length > MAX_QUOTED;
  return [...(cut ? `${body.trimEnd().slice(0, MAX_QUOTED)}…` : body.trimEnd()).split('\n').map((line) => `  > ${line}`), ...(cut ? [`  [cut: ${file}]`] : [])];
};

/** The task's state for a person, from the ledger and the files it names: what was planned, what each iteration ended as, and what is not verified. */
export async function renderSummary(task: string, entries: readonly LedgerEntry[], read: (file: string) => Promise<string | null>): Promise<string> {
  const chains = entries.filter((entry) => entry.kind === 'route').map((head) => buildChain(entries, head));
  const iterationOf = (chain: Chain): number | null => Number(chain.entries.find((entry) => entry.kind === 'step' && entry['step'] === 'start' && entry['iteration'] !== undefined)?.['iteration']) || null;
  const endOf = (chain: Chain): string => {
    const exit = exitOf(chain);
    return exit === null ? 'open' : `${exit['reason']}${typeof exit['detail'] === 'string' ? ` (${exit['detail']})` : ''}`;
  };
  const worked = (chain: Chain): boolean => chain.entries.some((entry) => WORK.includes(entry.kind));
  // A restart the model stopped at once must not replace the run before it; a lone one still shows, so its gaps do too.
  const latest = new Map<number, Chain>();
  for (const chain of chains) {
    const n = iterationOf(chain);
    const shown = n === null ? undefined : latest.get(n);
    if (n !== null && (shown === undefined || worked(chain) || !worked(shown))) latest.set(n, chain);
  }
  const rows = [...latest].sort(([a], [b]) => a - b);
  const others = chains.filter((chain) => iterationOf(chain) === null);

  const final = async (chain: Chain): Promise<string[]> => {
    const note = chain.entries.findLast((entry) => entry.kind === 'note' && (entry['note'] === 'result' || entry['note'] === 'investigation'));
    const body = note === undefined ? null : await read(text(note['path']));
    return body === null ? [] : quote(body, text(note!['path']));
  };

  const request = text((chains[0]?.head['args'] as { text?: unknown } | undefined)?.text).trim();
  const keys = [...new Set(entries.filter((entry) => entry.kind === 'envelope').flatMap((entry) => (Array.isArray(entry['sources']) ? entry['sources'] : []).map((source: { key?: unknown }) => String(source.key))))];
  const planned = entries.findLast((entry) => entry.kind === 'note' && entry['note'] === 'plan')?.['path'] ?? entries.findLast((entry) => entry['planPath'] !== undefined)?.['planPath'] ?? chains.map((chain) => (chain.head['args'] as { plan?: string | null }).plan).findLast((file) => typeof file === 'string');
  const planFile = typeof planned === 'string' ? planned : null;
  const plan = planFile === null ? null : await read(planFile);
  const lines = plan?.split('\n') ?? [];
  const title = lines.find((line) => /^#\s/.test(line))?.replace(/^#\s+/, '');
  const intro = lines.slice(lines.findIndex((line) => /^#\s/.test(line)) + 1);
  const goal = intro.slice(0, Math.max(0, intro.findIndex((line) => line.startsWith('#')))).find((line) => line.trim() !== '');
  // The task route's `next` step ends the route before its final message runs, so most rows have none; the plan's own title says what the row was.
  const titles = new Map(lines.flatMap((line) => {
    const found = /^##\s+Iteration\s+(\d+)\s*[:\u2014-]\s*(.+?)\s*$/i.exec(line);
    return found === null ? [] : [[Number(found[1]), found[2]!] as [number, string]];
  }));
  const decisions = chains.filter((chain) => chain.head['skill'] === 'plan').flatMap((chain) => chain.entries.filter((entry) => entry.kind === 'acceptance' && entry['via'] !== 'never-asked').flatMap((entry) => {
    const print = chain.entries.find((candidate) => candidate.id === entry['instance'] && candidate['class'] === 'decision');
    return print === undefined ? [] : [`${text(print['question']).replace(/\[ambicode gate [^\]]*\]/, '').trim().split('\n')[0]} → ${text(entry['answer'])}`];
  }));

  const gaps = [...rows.map(([, chain]) => chain), ...others].flatMap((chain) => gapsOf(chain.entries));
  const unformatted = entries.some((entry) => entry.kind === 'format' && entry['outcome'] === 'unconfigured');
  const inits = entries.filter((entry) => entry.kind === 'init');

  const iterationBlocks = await Promise.all(rows.map(async ([n, chain]) => {
    const total = chain.entries.find((entry) => entry.kind === 'step' && entry['step'] === 'start')?.['iterations'];
    const files = [...new Set(chain.entries.filter((entry) => entry.kind === 'check').flatMap((entry) => (Array.isArray(entry['files']) ? entry['files'] : []).map(String)))];
    const checks = checkFacts(chain.entries).filter((line) => line !== 'no formatter configured');
    const review = reviewFact(chain.entries);
    return [
      `- Iteration ${n} of ${String(total)}${titles.has(n) ? ` (${titles.get(n)})` : ''}: ${endOf(chain)}`,
      ...(await final(chain)),
      ...(files.length === 0 ? [] : [`  Files: ${files.join(', ')}`]),
      ...(checks.length === 0 ? [] : [`  Checks: ${checks.join('; ')}`]),
      ...(review === null ? [] : [`  Review: ${review}`]),
    ];
  }));
  const routeBlocks = await Promise.all(others.map(async (chain) => [`- ${text(chain.head['skill'])} · ${text(chain.head.at)} · ${endOf(chain)}`, ...(await final(chain))]));

  return [
    `# Task ${task}`,
    '',
    `Request: ${request === '' ? '(none)' : request}`,
    ...(keys.length === 0 ? [] : [`Requirement: ${keys.join(', ')}`]),
    `Plan: ${planFile ?? 'none'}`,
    ...(unformatted ? ['No formatter configured.'] : []),
    ...(title === undefined ? [] : ['', '## Plan', title, ...(goal === undefined ? [] : [goal.trim()]), ...lines.filter((line) => /^##\s+Iteration\s+\d+/i.test(line)).map((line) => `- ${line.replace(/^#+\s+/, '')}`), ...(decisions.length === 0 ? [] : ['Decisions:', ...decisions.map((line) => `- ${line}`)])]),
    ...(rows.length === 0 ? [] : ['', '## Iterations', ...iterationBlocks.flat()]),
    ...(others.length === 0 ? [] : ['', '## Routes', ...routeBlocks.flat()]),
    ...(inits.length === 0 ? [] : ['', '## Init', ...inits.map((entry) => `- ${text(entry['what'])}: ${text(entry['outcome'])}`)]),
    '',
    '## Not verified',
    ...(gaps.length === 0 ? ['none'] : [...new Set(gaps)].map((gap) => `- ${gap}`)),
    '',
  ].join('\n');
}
