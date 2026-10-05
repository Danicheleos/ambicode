import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AdvanceInput, StartInput, StepMessage } from '../route/engine.ts';
import { EVIDENCE_HANDLERS, type Handler } from '../route/handlers.ts';
import type { LedgerEntry } from '../task/ledger.ts';
import { ledgerRouteContext } from '../route/context.ts';
import { promotePlan, saveNote } from '../task/notes.ts';
import { routeFixture, type RouteFixture } from './route-fixture.ts';

export const A = 'aaaaaaaa-1111-4111-8111-111111111111';
export const B = 'bbbbbbbb-2222-4222-8222-222222222222';
export const TASK = 'ORD-17';

/** A plan-shaped route: the S2–S5 and S10–S14 mechanisms run on it until the real plan route ships (step 06). */
export const PLAN = `skill: plan
version: 3
budget: { modelSteps: 14 }
exits: [done, blocked, human, inconclusive, superseded, budget]
revisable: [design]
steps:
  - id: design
    actor: model
    instruction: "Design the plan."
    repeat: 2
  - id: plan-step
    actor: code
    run: [t.step]
    produces: ["policy{before-report}"]
  - id: plan-write
    actor: model
    instruction: "Write steps/plan-body.md once."
    repeat: 3
  - id: plan-check
    actor: code
    run: ["evidence.notes.save(plan-draft, from: steps/plan-body.md)", t.check]
    produces: ["note{plan-draft}", worker]
    onFail: revise plan-write
  - id: plan-accept
    actor: human
    gate:
      question: "Accept this plan?"
      object: "note{plan-draft}"
      options: [Accept, Revise, Reject]
      default: Reject
      release: Reject
      acting: [Accept]
      onAnswer: { Revise: revise design }
      maxRevises: 3
  - id: promote
    actor: code
    when: gate.plan-accept.is(Accept)
    run: [evidence.notes.promote]
    onFail: revise plan-accept
    produces: ["note{plan}"]
`;

export interface PlanState { checkOk: boolean; checks: number; steps: number }

export function planHandlers(state: PlanState): Record<string, Handler> {
  return {
    ...EVIDENCE_HANDLERS,
    't.step': async ({ ledger }) => {
      state.steps += 1;
      await ledger.append({ kind: 'policy', stage: 'before-report', packs: [], rules: 0, omitted: 0, bytes: 1 });
      return { state: 'ok', payload: null };
    },
    't.check': async ({ ledger }) => {
      state.checks += 1;
      await ledger.append({ kind: 'worker', worker: 'plan-check', outcome: state.checkOk ? 'pass' : 'fail', ms: 1, artifact: 'workers/x.json' });
      return state.checkOk ? { state: 'ok', payload: null } : { state: 'failed', code: 'plan-check-failed', message: 'bad anchors', recoverable: true };
    },
  };
}

export interface PlanFixture {
  fx: RouteFixture;
  state: PlanState;
  start(input?: Partial<StartInput>): Promise<StepMessage>;
  next(input?: Partial<AdvanceInput>): Promise<StepMessage>;
  hook(gate: string, option: string, instance: string | undefined, input?: Partial<AdvanceInput>): Promise<StepMessage>;
  body(text: string, task?: string): Promise<void>;
  /** The `note save --from` and `note promote` commands, as a command run by `session`. */
  saveDraft(text: string, session?: string): Promise<unknown>;
  promote(session?: string): ReturnType<typeof promotePlan>;
  /** Walks a fresh plan route to the plan-accept print. */
  toGate(input?: Partial<StartInput>): Promise<StepMessage>;
  prints(task?: string): Promise<LedgerEntry[]>;
  dispose(): Promise<void>;
}

export async function planFixture(options: { extra?: Record<string, string>; handlers?: Record<string, Handler>; config?: string } = {}): Promise<PlanFixture> {
  const state: PlanState = { checkOk: true, checks: 0, steps: 0 };
  const fx = await routeFixture({ routes: { plan: PLAN, ...(options.extra ?? {}) }, handlers: { ...planHandlers(state), ...(options.handlers ?? {}) }, ...(options.config === undefined ? {} : { config: options.config }) });
  const start = (input: Partial<StartInput> = {}) =>
    fx.engine.start({ skill: 'plan', text: 'add a limit', requirements: [], task: TASK, cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad, ...input });
  const next = (input: Partial<AdvanceInput> = {}) => fx.engine.advance({ task: TASK, session: A, cause: 'route-next', scratchpadDir: fx.scratchpad, ...input });
  const body = async (text: string, task = TASK): Promise<void> => {
    const file = path.join(fx.repo.root, '.ambicode', 'task', task, 'steps', 'plan-body.md');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  };
  return {
    fx,
    state,
    start,
    next,
    hook: (gate, option, instance, input = {}) =>
      next({ cause: 'gate-hook', answers: [{ gate, option, ...(instance === undefined ? {} : { instance }) }], ...input }),
    body,
    async saveDraft(text, session = A) {
      await body(text);
      return saveNote({ runtime: fx.runtime, session, context: ledgerRouteContext({ runtime: fx.runtime, routes: fx.routes }) }, { task: TASK, kind: 'plan-draft', body: null, from: 'steps/plan-body.md', iteration: null });
    },
    promote: (session = A) => promotePlan({ runtime: fx.runtime, session, context: ledgerRouteContext({ runtime: fx.runtime, routes: fx.routes }) }, TASK),
    async toGate(input = {}) {
      await start(input);
      await next();
      await body('# Plan\n\n1. Do it.\n');
      return next();
    },
    prints: (task = TASK) => fx.kinds(task, 'gate'),
    dispose: () => fx.dispose(),
  };
}
