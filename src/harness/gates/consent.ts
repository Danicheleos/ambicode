import { isBoundAnswer, latestBound } from '../engine/fold.ts';
import type { ArtifactRef, LedgerEntry } from '#types/evidence';
import type { AcceptanceEntry, ConsentResult } from '#types/harness';
import type { ConsentBinding } from '../types/engine.ts';

type Entry = LedgerEntry;

const ANSWER_KINDS = ['acceptance', 'declined', 'default-taken'];

/**
 * The answer a consumer may act on (03-G11): the latest bound answer of the gate's window, an acceptance, and for an
 * acting option one that came from a printed instance through the hook or from a preanswer written at a trusted start.
 */
export function evaluateConsent(input: {
  window: readonly Entry[];
  chain: readonly Entry[];
  gate: string;
  acting: readonly string[];
  binding?: ConsentBinding | undefined;
}): ConsentResult {
  const { window, chain, gate, acting, binding } = input;
  const answers = window.filter((entry) => ANSWER_KINDS.includes(entry.kind) && entry['gate'] === gate);
  const bound = latestBound(window, gate);
  if (bound === null) {
    if (answers.some((entry) => entry['unbound'] === true)) return { state: 'refused', reason: 'unbound', source: answers.findLast((entry) => entry['unbound'] === true) ?? null };
    const declined = answers.findLast((entry) => entry.kind === 'declined' && entry['reason'] === 'acting-needs-human');
    return declined === undefined ? { state: 'refused', reason: 'no-answer', source: null } : { state: 'refused', reason: 'acting-needs-human', source: declined };
  }
  if (bound.kind !== 'acceptance') {
    const earlier = window.slice(0, window.indexOf(bound)).some((entry) => entry.kind === 'acceptance' && isBoundAnswer(entry) && entry['gate'] === gate);
    return { state: 'refused', reason: earlier ? 'superseded' : 'not-accepted', source: bound };
  }
  const option = String(bound['answer']);
  if (acting.includes(option)) {
    const printed = bound['via'] === 'hook' && typeof bound['instance'] === 'string' && chain.some((entry) => entry.kind === 'gate' && entry.id === bound['instance'] && entry['gate'] === gate);
    const prompted = bound['via'] === 'prompt' && bound['trusted'] === true;
    if (!printed && !prompted) return { state: 'refused', reason: 'acting-needs-human', source: bound };
  }
  if (binding?.key !== undefined) {
    const print = chain.find((entry) => entry.kind === 'gate' && entry.id === bound['instance']);
    const keys = (print?.['values'] as { key?: unknown } | undefined)?.key;
    if (!Array.isArray(keys) || !keys.includes(binding.key)) return { state: 'refused', reason: 'not-accepted', source: bound };
  }
  if (binding?.set !== undefined) {
    const accepted = Array.isArray(bound['set']) ? (bound['set'] as string[]) : [];
    if (JSON.stringify([...accepted].sort()) !== JSON.stringify([...binding.set].sort())) return { state: 'refused', reason: 'not-accepted', source: bound };
  }
  return { state: 'honoured', source: bound as unknown as AcceptanceEntry, object: (bound['object'] as ArtifactRef | undefined) ?? null };
}

