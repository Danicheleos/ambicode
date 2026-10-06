import { AmbicodeError } from '#util/errors';
import { navigationLine } from '#modules/evidence/report/navigation-line';
import { promotePlan, saveNote } from '#modules/evidence/notes';
import type { Handler, HandlerResult } from '#types/harness';
import type { SaveKind } from '#types/modules/evidence';

const failedWith = (error: unknown): HandlerResult => {
  if (error instanceof AmbicodeError) return { state: 'failed', code: error.code, message: error.message, recoverable: false };
  throw error;
};

/** `evidence.*` adapters over step 02's writers; they take the ledger the engine already holds. */
export const EVIDENCE_HANDLERS: Readonly<Record<string, Handler>> = {
  'evidence.navigationLine': async ({ ledger, view }) => {
    const read = await ledger.read();
    const entries = read.state === 'ok' ? read.entries.filter((entry) => view.chainIds.includes(String((entry as { route?: unknown }).route ?? entry.id))) : [];
    return { state: 'ok', payload: navigationLine(entries) };
  },
  'evidence.notes.save': async ({ params, ledger, runtime, view, context, produced, raisedBy }) => {
    const kind = params[0] as SaveKind | undefined;
    const from = params.find((param) => param.startsWith('from:'))?.slice('from:'.length).trim() ?? null;
    if (kind === undefined) return { state: 'failed', code: 'internal', message: 'evidence.notes.save needs a note kind.', recoverable: false };
    if (produced.length > 0 && (await context.window(view, raisedBy)).some((entry) => produced.includes(entry.id) && entry.kind === 'note' && entry['note'] === kind)) return { state: 'ok', payload: null };
    try {
      await saveNote({ runtime, session: view.session, context, ledger }, { task: view.task, kind, body: null, from, iteration: null, route: view.routeId });
      return { state: 'ok', payload: null };
    } catch (error) {
      return failedWith(error);
    }
  },
  'evidence.notes.promote': async ({ ledger, runtime, view, context }) => {
    try {
      await promotePlan({ runtime, session: view.session, context, ledger }, view.task);
      return { state: 'ok', payload: null };
    } catch (error) {
      return failedWith(error);
    }
  },
};
