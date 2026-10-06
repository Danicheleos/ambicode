import type { Runtime } from '../composition/root.ts';
import { AmbicodeError } from '../util/errors.ts';
import { navigationLine } from '../task/navigation-line.ts';
import { promotePlan, saveNote, type NoteKind } from '../task/notes.ts';
import type { TaskDir } from '../task/task-dir.ts';
import type { LockedLedger } from '../task/ledger-lock.ts';
import type { RouteContextPort, RouteView } from './context.ts';
import type { RouteArgs } from './flags.ts';
import type { Call } from './routes.ts';
import { MODULE_HANDLERS } from './handlers-modules.ts';
import { INIT_HANDLERS } from '../config/init-route.ts';
import { RULES_HANDLERS } from '../policy/rules-route.ts';

export interface HandlerInput {
  view: RouteView;
  context: RouteContextPort;
  dir: TaskDir;
  args: RouteArgs;
  params: readonly string[];
  ledger: LockedLedger;
  runtime: Runtime;
  raisedBy: string;
  revise: { args: Readonly<Record<string, readonly string[]>> } | null;
}

/** Handlers never parse CLI flags, call wrappers or advance the engine. */
export type HandlerResult =
  | { state: 'ok'; payload: string | null }
  | { state: 'failed'; code: string; message: string; recoverable: boolean }
  | { state: 'raise'; gate: string; values: Readonly<Record<string, readonly string[]>> };

export type Handler = (input: HandlerInput) => Promise<HandlerResult>;

export interface HandlerRegistry {
  get(name: string): Handler | null;
  names(): readonly string[];
}

export function handlerRegistry(handlers: Readonly<Record<string, Handler>>): HandlerRegistry {
  return { get: (name) => handlers[name] ?? null, names: () => Object.keys(handlers) };
}

/** The key a step's `payload` list names a call's output by. */
export function payloadKey(call: Call): string {
  switch (call.name) {
    case 'search.map': return 'map';
    case 'policy.stage': return `policy:${call.params[0] ?? ''}`;
    case 'requirements.acs': return 'acs';
    case 'requirements.template': return 'template';
    case 'requirements.normalize': return 'envelope';
    case 'evidence.navigationLine': return 'navigation';
    default: return call.name;
  }
}

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
  'evidence.notes.save': async ({ params, ledger, runtime, view, context }) => {
    const kind = params[0] as NoteKind | undefined;
    const from = params.find((param) => param.startsWith('from:'))?.slice('from:'.length).trim() ?? null;
    if (kind === undefined) return { state: 'failed', code: 'internal', message: 'evidence.notes.save needs a note kind.', recoverable: false };
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

export function defaultHandlers(): Record<string, Handler> {
  return { ...MODULE_HANDLERS, ...EVIDENCE_HANDLERS, ...INIT_HANDLERS, ...RULES_HANDLERS };
}
