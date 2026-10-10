import path from 'node:path';
import { contentHash } from '#util/hash';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';

export const EVAL_EXPORT_VARIABLE = 'EVAL_AMBICODE_EXPORT';

/**
 * Under an eval, the final ledger and its notes are copied out of the sandbox, which the harness deletes when the run
 * ends: polling it every 2 s left 7 of runs 24–27's ledgers short of their last entries. A failure is said, never thrown.
 */
export async function exportForEval(runtime: Runtime, input: { root: string; session: string; task: string; ledger: string; entries: readonly LedgerEntry[] }): Promise<void> {
  const root = runtime.env[EVAL_EXPORT_VARIABLE];
  if (root === undefined || root === '') return;
  try {
    const target = path.join(root, input.session, input.task);
    await runtime.fs.mkdirp(path.join(target, 'notes'));
    const notes = [...new Set(input.entries.filter((entry) => entry.kind === 'note' && typeof entry['path'] === 'string').map((entry) => String(entry['path'])))];
    const files = [await exportFile(runtime, input.ledger, target, 'ledger.jsonl')];
    for (const note of notes) files.push(await exportFile(runtime, path.join(input.root, note), target, path.join('notes', path.basename(note))));
    // Promotion renames a draft to its plan, so the draft is absent by design; its bytes count only if the plan was copied.
    for (const promotion of input.entries.filter((entry) => entry.kind === 'note' && typeof entry['promotedFrom'] === 'string')) {
      const draft = input.entries.find((entry) => entry.id === promotion['promotedFrom']);
      const missing = files.find((file) => draft !== undefined && file.error === 'missing' && file.to === path.join('notes', path.basename(String(draft['path']))));
      const plan = files.find((file) => file.to === path.join('notes', path.basename(String(promotion['path']))));
      if (missing !== undefined && plan?.copied === true && plan.hash === promotion['contentHash']) Object.assign(missing, { error: 'promoted', promotedTo: String(promotion['path']) });
    }
    const complete = files.every((file) => file.copied || file.error === 'promoted');
    if (!complete) process.stderr.write(`ambicode stop: export incomplete, ${files.filter((file) => !file.copied && file.error !== 'promoted').map((file) => file.to).join(', ')}\n`);
    await runtime.fs.writeText(path.join(target, 'source.json'), `${JSON.stringify({ ledger: input.ledger, entries: input.entries.length, notes, complete, files })}\n`);
  } catch (error) {
    process.stderr.write(`ambicode stop: export failed, ${(error as Error).message}\n`);
  }
}

/** One exported file: `copied` holds only when the copy's hash equals the source's. */
async function exportFile(runtime: Runtime, from: string, target: string, name: string): Promise<{ from: string; to: string; present: boolean; bytes: number | null; hash: string | null; copied: boolean; error?: string; promotedTo?: string }> {
  const bytes = await runtime.fs.readBytes(from).catch(() => null);
  if (bytes === null) return { from, to: name, present: false, bytes: null, hash: null, copied: false, error: 'missing' };
  const hash = contentHash(bytes);
  try {
    await runtime.fs.copyFile(from, path.join(target, name));
    const copy = contentHash(await runtime.fs.readBytes(path.join(target, name)));
    return { from, to: name, present: true, bytes: bytes.length, hash, copied: copy === hash, ...(copy === hash ? {} : { error: `copy hash ${copy}` }) };
  } catch (error) {
    return { from, to: name, present: true, bytes: bytes.length, hash, copied: false, error: (error as Error).message };
  }
}
