import { isBoundAnswer, latestBound } from '../engine/fold.ts';
import type { ArtifactRef, LedgerEntry } from '#types/modules/evidence';
import type { AcceptanceEntry, ConsentResult } from '#types/harness';
import type { ConsentBinding } from '../types/engine.ts';


const ANSWER_KINDS = ['acceptance', 'declined', 'default-taken'];

/**
 * The answer a consumer may act on (03-G11): the latest bound answer of the gate's window, an acceptance, and for an
 * acting option one that came from a printed instance through the hook or from a preanswer written at a trusted start.
 */
export function evaluateConsent(input: {
  window: readonly LedgerEntry[];
  chain: readonly LedgerEntry[];
  gate: string;
  acting: readonly string[];
  binding?: ConsentBinding | undefined;
}): ConsentResult {
  const { chain, gate, acting, binding } = input;
  // A key's consent is the latest answer bound to a print that lists the key (or a decline typed for it): another key's answer on the same gate is not about it.
  const listsKey = (entry: LedgerEntry): boolean => {
    const keys = (chain.find((print) => print.kind === 'gate' && print.id === entry['instance'])?.['values'] as { key?: unknown } | undefined)?.key;
    return entry['key'] === binding?.key || (Array.isArray(keys) && keys.includes(binding?.key));
  };
  const window = binding?.key === undefined ? input.window : input.window.filter((entry) => entry['gate'] !== gate || !ANSWER_KINDS.includes(entry.kind) || listsKey(entry));
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
  // A gate with acting options: any other answer (`decline`, `skip`) is a decline, and a decline is never consent to act.
  if (acting.length > 0 && !acting.includes(option)) return { state: 'refused', reason: 'not-accepted', source: bound };
  if (acting.includes(option)) {
    const printed = bound['via'] === 'hook' && typeof bound['instance'] === 'string' && chain.some((entry) => entry.kind === 'gate' && entry.id === bound['instance'] && entry['gate'] === gate);
    const prompted = bound['via'] === 'prompt' && bound['trusted'] === true;
    if (!printed && !prompted) return { state: 'refused', reason: 'acting-needs-human', source: bound };
  }
  return { state: 'honoured', source: bound as unknown as AcceptanceEntry, object: (bound['object'] as ArtifactRef | undefined) ?? null };
}

