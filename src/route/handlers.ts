import type { Runtime } from '../composition/root.ts';
import { AmbicodeError } from '../util/errors.ts';
import { navigationLine } from '../task/navigation-line.ts';
import { promotePlan, saveNote, type SaveKind } from '../task/notes.ts';
import type { TaskDir } from '../task/task-dir.ts';
import type { LockedLedger } from '../task/ledger-lock.ts';
import type { RouteContextPort, RouteView } from './context.ts';
import type { RouteArgs } from './flags.ts';
import type { Call, RouteDef } from './routes.ts';
import { MODULE_HANDLERS } from './handlers-modules.ts';
import { INIT_HANDLERS } from '../config/init-route.ts';
import { RULES_HANDLERS } from '../policy/rules-route.ts';
import { planCheckStep } from '../workers/plan-check.ts';
import { TASK_HANDLERS } from '../task/task-route.ts';
import { REVIEW_HANDLERS } from '../review/route-handlers.ts';

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
  /** Entry ids the command that advanced the route wrote for this step to consume (D1); empty otherwise. */
  produced: readonly string[];
  def?: RouteDef;
}

/**
 * Handlers never parse CLI flags, call wrappers or advance the engine. `record` adds fields to the step's completed
 * record; `exit` ends the route with that reason once the step is recorded. A `raisedBy` other than the running step
 * makes an approval revise that step; the print stays open at the running one.
 */
export type HandlerResult =
  | { state: 'ok'; payload: string | null; record?: Readonly<Record<string, unknown>>; exit?: string }
  | { state: 'failed'; code: string; message: string; recoverable: boolean; revise?: { args: Readonly<Record<string, readonly string[]>>; lastRound?: string } }
  | { state: 'raise'; gate: string; values: Readonly<Record<string, readonly string[]>>; raisedBy?: string };

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
    case 'task.start': return 'brief';
    case 'task.inventory': return 'callers';
    case 'checks.baseline': return 'baseline';
    case 'task.report': return 'report';
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
  'workers.planCheck': planCheckStep,
};

export function defaultHandlers(): Record<string, Handler> {
  return { ...MODULE_HANDLERS, ...EVIDENCE_HANDLERS, ...INIT_HANDLERS, ...RULES_HANDLERS, ...TASK_HANDLERS, ...REVIEW_HANDLERS };
}
