import { onRaisedAnswer } from '#harness/gates/gates';
import { contentHash } from '#util/hash';
import type { LedgerEntry, LockedLedger } from '#types/modules/evidence';
import type { HandlerResult, RouteView } from '#types/harness';

const GATE = 'requirements-conflicting';

async function chainOf(ledger: LockedLedger, view: RouteView): Promise<LedgerEntry[]> {
  const read = await ledger.read();
  return read.state === 'ok' ? read.entries.filter((entry) => view.chainIds.includes(entry.kind === 'route' ? entry.id : String(entry['route'] ?? ''))) : [];
}

const keysOf = (envelope: LedgerEntry | undefined): string[] =>
  Array.isArray(envelope?.['sources']) ? (envelope['sources'] as { key: string }[]).map((source) => source.key) : [];

/** `--conflict "<summary>" --sources A,B`: two or more distinct source ids of the latest envelope, then the gate (04-K1, 04-K2). */
export async function raiseConflict(input: { view: RouteView; ledger: LockedLedger; summary: string; sources: readonly string[] }): Promise<HandlerResult> {
  const keys = keysOf((await chainOf(input.ledger, input.view)).findLast((entry) => entry.kind === 'envelope'));
  const sources = [...new Set(input.sources.map((source) => source.trim()).filter((source) => source !== ''))];
  if (sources.length < 2 || sources.some((source) => !keys.includes(source))) {
    return {
      state: 'failed',
      code: 'requirements-conflict-sources',
      message: `--sources needs at least two distinct source ids from the latest envelope (${keys.join(', ') || 'none recorded'}).`,
      recoverable: false,
    };
  }
  return { state: 'raise', gate: GATE, values: { sources, summary: [input.summary] } };
}

/** A governing-source answer: a new envelope equal to the latest plus the conflict and its governing source; once per acceptance (04-K4). */
export async function recordGoverning(input: { view: RouteView; ledger: LockedLedger; acceptance: LedgerEntry }): Promise<LedgerEntry | null> {
  const answer = String(input.acceptance['answer']);
  if (answer === 'stop') return null;
  const entries = await chainOf(input.ledger, input.view);
  const envelope = entries.findLast((entry) => entry.kind === 'envelope');
  const print = entries.find((entry) => entry.id === input.acceptance['instance']);
  if (envelope === undefined || print === undefined) return null;
  const earlier = (entries.filter((entry) => entry.kind === 'envelope').flatMap((entry) => (Array.isArray(entry['conflicts']) ? entry['conflicts'] : [])) as { acceptance: string }[]);
  if (earlier.some((conflict) => conflict.acceptance === input.acceptance.id)) return null;
  const values = (print['values'] ?? {}) as { summary?: string[]; sources?: string[] };
  const { id: _id, at: _at, kind: _kind, route: _route, hash: _hash, ...fields } = envelope;
  const merged = { ...fields, conflicts: [...(Array.isArray(envelope['conflicts']) ? (envelope['conflicts'] as object[]) : []), { summary: values.summary?.[0] ?? '', sources: values.sources ?? [], governing: answer, acceptance: input.acceptance.id }] };
  return input.ledger.append({ kind: 'envelope', route: input.view.routeId, ...merged, hash: contentHash(JSON.stringify(merged)) } as never);
}

onRaisedAnswer(GATE, async (input) => void (await recordGoverning(input)));
