import type { CapturedHits } from '#types/requirements';
import { readList } from './capture-files.ts';
import type { Runtime } from '#types/composition';
import type { LedgerEntry, TaskDir } from '#types/evidence';
import { EXPANSION_FETCH } from '../types/capture.ts';

export type CapturedList = CapturedHits;
export type ExpansionDecision =
  | { state: 'none-needed' }
  | { state: 'raise'; parent: string; keys: string[] }
  | { state: 'fetch'; parent: string; keys: string[] }
  | { state: 'done' };

export const EXPANSION_GATE = 'requirements-expansion-capped';
const CAP = 10;
const JIRA_KEY = /^[A-Z][A-Z0-9]+-\d+$/;

export const hitCount = (list: CapturedList): number => Math.max(list.hits.length, list.total);

/** What an answer chose among the stored hits; keys that are not hits are dropped. */
function chosen(answer: string, hits: readonly string[]): { keys: string[]; dropped: string[] } {
  if (answer === 'read all') return { keys: [...hits], dropped: [] };
  if (!answer.startsWith('read these:')) return { keys: [], dropped: [] };
  const named = [...new Set(answer.slice('read these:'.length).split(',').map((key) => key.trim()).filter((key) => key !== ''))];
  return { keys: named.filter((key) => hits.includes(key)), dropped: named.filter((key) => !hits.includes(key)) };
}

/**
 * For each asked Jira key whose latest `parent = K` list holds more than 10 hits, the next step of the expansion gate:
 * raise it, ask for the chosen children, or nothing more. One key at a time, in asked order.
 */
export async function expansionFor(input: {
  runtime: Runtime;
  dir: TaskDir;
  entries: readonly LedgerEntry[];
  asked: readonly string[];
  complete: ReadonlySet<string>;
}): Promise<ExpansionDecision & { notices: string[] }> {
  const { entries } = input;
  const notices: string[] = [];
  let capped = false;
  for (const parent of input.asked.filter((key) => JIRA_KEY.test(key))) {
    const listing = entries.findLast((entry) => entry.kind === 'requirement' && entry['capture'] === 'list' && entry['derivedFrom'] === parent);
    if (listing === undefined || Number(listing['hits']) <= CAP) continue;
    const list = await readList(input.runtime.fs, input.dir, String(listing['rawHash']));
    if (list === null) continue;
    capped = true;
    const hits = list.hits.map((hit) => hit.key);
    const print = entries.findLast((entry) => entry.kind === 'gate' && entry['gate'] === EXPANSION_GATE && (entry['values'] as { parent?: string[] } | undefined)?.parent?.[0] === parent);
    const read = entries.some((entry) => entry.kind === 'requirement' && entry['capture'] === 'full' && entry['derivedFrom'] === parent);
    if (print === undefined) {
      if (read) continue;
      return { state: 'raise', parent, keys: hits, notices };
    }
    const after = entries.slice(entries.indexOf(print) + 1);
    const answer = after.find((entry) => (entry.kind === 'acceptance' || entry.kind === 'default-taken') && entry['gate'] === EXPANSION_GATE && entry['instance'] === print.id);
    if (answer === undefined) return { state: 'raise', parent, keys: hits, notices };
    const { keys, dropped } = chosen(String(answer['answer']), hits);
    if (dropped.length > 0) notices.push(`requirements-expansion-dropped: ${dropped.join(', ')} are not hits of ${parent}.`);
    const missing = keys.filter((key) => !input.complete.has(key));
    if (missing.length === 0) continue;
    if (!entries.slice(entries.indexOf(answer) + 1).some((entry) => entry.kind === 'step' && entry['status'] === 'failed' && entry['code'] === EXPANSION_FETCH)) {
      return { state: 'fetch', parent, keys, notices };
    }
    notices.push(`requirements-expansion-partial: ${missing.join(', ')} chosen under ${parent} but not captured.`);
  }
  return { state: capped ? 'done' : 'none-needed', notices };
}
