import { promotePlan, saveNote } from '#modules/evidence/notes';
import { failed } from './common.ts';
import type { Handler } from '#types/harness';
import type { SaveKind } from '#types/modules/evidence';

/** `evidence.*` adapters over step 02's writers; they take the ledger the engine already holds. */
export const EVIDENCE_HANDLERS: Readonly<Record<string, Handler>> = {
  'evidence.notes.save': async ({ params, ledger, runtime, view, context, produced, raisedBy }) => {
    const kind = params[0] as SaveKind | undefined;
    const from = params.find((param) => param.startsWith('from:'))?.slice('from:'.length).trim() ?? null;
    if (kind === undefined) return { state: 'failed', code: 'internal', message: 'evidence.notes.save needs a note kind.', recoverable: false };
    if (produced.length > 0 && (await context.window(view, raisedBy)).some((entry) => produced.includes(entry.id) && entry.kind === 'note' && entry['note'] === kind)) return { state: 'ok', payload: null };
    try {
      await saveNote({ runtime, session: view.session, context, ledger }, { task: view.task, kind, body: null, from, route: view.routeId });
      return { state: 'ok', payload: null };
    } catch (error) {
      return failed(error);
    }
  },
  'evidence.notes.promote': async ({ ledger, runtime, view, context }) => {
    try {
      await promotePlan({ runtime, session: view.session, context, ledger }, view.task);
      return { state: 'ok', payload: null };
    } catch (error) {
      return failed(error);
    }
  },
};
