import { contentHash } from '#util/hash';
import { navigationLine } from './navigation-line.ts';
import { isBoundAnswer } from '#modules/evidence/ledger-chain';
import type { LedgerEntry } from '#types/modules/evidence';

const clip = (value: unknown, length = 80): string => {
  const text = String(value ?? '');
  return text.length > length ? `${text.slice(0, length)}…` : text;
};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Evidence and Not verified, generated from the ledger alone: the same entries give the same bytes. Nothing here
 * says a test passed unless a `check` entry carries a test count; a delivery or an exit code alone proves none.
 */
export function buildReport(
  entries: readonly LedgerEntry[],
  options: { current?: (entry: LedgerEntry) => boolean; complete?: boolean } = {},
): { status: string | null; evidence: string; notVerified: string; hash: string; text: string } {
  const historical = (entry: LedgerEntry): string => (options.current === undefined || options.current(entry) ? '' : ' (historical)');
  const of = (...kinds: string[]): LedgerEntry[] => entries.filter((entry) => kinds.includes(entry.kind));
  const line = (name: string, parts: string[]): string => `  ${name}: ${parts.length === 0 ? 'none recorded' : parts.join('; ')}`;

  const origins = of('envelope').map((entry) => {
    const keys = list(entry.sources).map((source) => clip((source as { key?: unknown } | null)?.key, 40));
    const missing = list(entry.missingAsked).map((key) => clip(key, 40));
    const origin = entry.builtFrom === 'captures'
      ? `${keys.length} source(s) from captures (${keys.join(', ')})${typeof entry.server === 'string' ? ` via ${clip(entry.server, 40)}` : ''}`
      : 'built from the args text (not captured)';
    return `${origin}${missing.length === 0 ? '' : `; missing: ${missing.join(', ')}`}${historical(entry)}`;
  });
  const requirements = [...origins, ...of('requirement').map((entry) => `${clip(entry.key)} (${clip(entry.relation)})${historical(entry)}`)];

  const maps = of('map').map((entry) => {
    const layers = list(entry.layers).map((layer) => clip((layer as { name?: unknown } | null)?.name)).join('→');
    return `${layers === '' ? 'map' : `layers ${layers}`}, ${list(entry.collisions).length} colliding names${historical(entry)}`;
  });

  const baselines = of('baseline').map((entry) => `${clip(entry.head ?? 'unknown', 12)}, dirty: ${list(entry.dirty).map((item) => (typeof item === 'string' ? item : clip((item as { path?: unknown } | null)?.path))).join(', ') || 'none'}${historical(entry)}`);

  const keys = new Map<string, LedgerEntry[]>();
  for (const entry of of('check')) keys.set(String(entry.key), [...(keys.get(String(entry.key)) ?? []), entry]);
  const notVerified: string[] = [];
  const checks = [...keys].map(([key, runs]) => {
    const only = (runs.at(-1)?.only as unknown[] | undefined) ?? [];
    const steps = runs.map((run) => {
      const summary = run.summary as { ran: number; failed: number } | null;
      return `${clip(run.phase)} exit ${run.exit}${summary === null ? '' : ` (${summary.ran} ran, ${summary.failed} failed)`}${historical(run)}`;
    });
    const last = runs.at(-1)!;
    const summary = last.summary as { ran: number; failed: number } | null;
    if (summary === null) notVerified.push(`${key}: test count unknown (exit code only)${historical(last)}`);
    else if (summary.ran === 0) notVerified.push(`${key}: no tests ran${historical(last)}`);
    if (last.exit !== 0) notVerified.push(`${key}: last run exited ${last.exit}${historical(last)}`);
    return `${key}${only.length > 0 ? ` --only ${only.join(' ')}` : ''}: ${steps.join(' → ')}`;
  });

  const reviews = of('review').map((entry) => {
    const ran = entry.reviewerRan !== false;
    const text = `${clip(entry.reviewId)} ${clip(entry.status ?? 'unknown')}${typeof entry.findings === 'number' ? `, ${entry.findings} findings` : ''}${historical(entry)}`;
    const omitted = typeof entry.omissions === 'number' ? entry.omissions : list(entry.omissions).length;
    if (!ran || (typeof entry.status === 'string' && entry.status !== 'complete')) {
      notVerified.push(`Review ${clip(entry.reviewId)}: ${ran ? '' : 'the reviewer did not run, '}status ${clip(entry.status ?? 'unknown')}${omitted > 0 ? `, ${omitted} omissions` : ''}${historical(entry)}`);
    }
    return text;
  });

  const decisions: string[] = [];
  for (const entry of of('preanswer', 'acceptance', 'declined', 'default-taken')) {
    // A preanswer converted at the print was given before the draft it accepts existed (P42).
    const via = entry.kind === 'acceptance' && entry.via === 'prompt' && entry.gate === 'plan-accept' ? 'answered in the prompt (before the artifact existed)' : `via ${clip(entry.via)}`;
    const how = entry.kind === 'preanswer' ? `"${clip(entry.option)}" (preanswer)` : `${entry.kind === 'acceptance' ? '' : `${entry.kind} `}"${clip(entry.answer)}" (${via})`;
    decisions.push(`${clip(entry.gate)} ${how}${historical(entry)}`);
    if (entry.kind === 'declined') notVerified.push(`${clip(entry.gate)}: declined "${clip(entry.answer)}"${entry.reason === undefined ? '' : ` (${clip(entry.reason)})`}${historical(entry)}`);
    if (entry.kind === 'default-taken') notVerified.push(`${clip(entry.gate)}: default taken, "${clip(entry.answer)}" (${clip(entry.via)})${historical(entry)}`);
    if (entry.kind !== 'preanswer' && entry.gate === 'review-again' && entry.answer === 'skip') notVerified.push(`fix not re-reviewed${historical(entry)}`);
    if (entry.kind !== 'preanswer' && entry.gate === 'review-offer' && String(entry.answer).startsWith('skip') && isBoundAnswer(entry)) notVerified.push(`independent review skipped — verification incomplete${historical(entry)}`);
  }
  for (const entry of of('format')) if (entry.outcome !== 'formatted') notVerified.push(`not formatted: ${clip(entry.key)} (${clip(entry.outcome)})${historical(entry)}`);

  const revisions = new Map<string, LedgerEntry[]>();
  for (const entry of of('revise')) revisions.set(String(entry.from), [...(revisions.get(String(entry.from)) ?? []), entry]);

  for (const entry of of('limit')) {
    if (entry.which === 'no-red') notVerified.push(`no-red: no failing-first test recorded${historical(entry)}`);
    else if (entry.which === 'read-bytes') notVerified.push(`read-bytes limit: ${clip(entry.bytes)} B read in the route, soft cap ${clip(entry.cap)}${historical(entry)}`);
    else notVerified.push(`${clip(entry.which)} limit (${entry.count})${typeof entry.step === 'string' ? ` at ${entry.step}` : ''}${historical(entry)}`);
  }
  for (const entry of of('envelope')) for (const missing of list(entry.missingAsked)) notVerified.push(`Requirement not captured: ${clip(missing)}${historical(entry)}`);
  for (const entry of of('route')) {
    if (entry.mode === 'headless' && entry.channel === 'cli') notVerified.push(`Route ${entry.id}: headless set by an untrusted start (channel cli)${historical(entry)}`);
  }

  const evidence = [
    'Evidence',
    line('Requirements', requirements),
    line('Map', maps),
    `  ${navigationLine(entries)}`,
    line('Baseline', baselines),
    line('Checks', checks),
    line('Review', reviews),
    line('Decisions', decisions),
    line('Revisions', [...revisions].map(([from, runs]) => `${clip(from)} ×${runs.length} (last: ${clip(runs.at(-1)?.reason, 60)})${historical(runs.at(-1)!)}`)),
  ].join('\n');
  const unverified = `Not verified\n${notVerified.length === 0 ? '  none recorded' : notVerified.map((item) => `  ${item}`).join('\n')}`;
  const hash = contentHash(`${evidence}\n${unverified}`);
  const status = statusOf(entries, notVerified.filter((item) => !item.endsWith(' (historical)')).length, options.complete === true);
  const body = `${evidence}\n${unverified}\n<!-- ambicode report ${hash} -->`;
  return { status, evidence, notVerified: unverified, hash, text: status === null ? body : `${status}\n${body}` };
}

/** The report's first line: how the route ended, or `complete` with what was not verified (03-E12). */
function statusOf(entries: readonly LedgerEntry[], unverified: number, complete: boolean): string | null {
  if (!entries.some((entry) => entry.kind === 'route')) return null;
  const ended = entries.findLast((entry) => entry.kind === 'exit');
  const done = complete || ended?.complete === true;
  if (ended !== undefined && !done) {
    const detail = typeof ended.detail === 'string' ? ended.detail : '';
    return detail.startsWith('permission-denied') ? `ended: ${clip(ended.reason)} (${clip(detail, 120)})` : `ended: ${clip(ended.reason)}${detail === '' ? '' : ` (${clip(detail, 120)})`}`;
  }
  if (!done) return 'in progress';
  return unverified === 0 ? 'complete' : `complete, ${unverified} items not verified`;
}
