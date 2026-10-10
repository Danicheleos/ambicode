import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { skillHandlers } from '#skills/handlers';
import { EVIDENCE_HANDLERS } from '#skills/evidence';
import { commandContext } from '#harness/engine/context';
import { promotePlan, saveNote } from '#modules/evidence/notes';
import { routeFixture, type RouteFixture } from './route-fixture.ts';
import { REPO_ROOT } from '../paths.ts';
import type { LedgerEntry } from '#types/modules/evidence';
import type { AdvanceInput, StartInput, StepMessage, Handler } from '#types/harness';
import { SESSION_A } from './ids.ts';
export const PLAN_TASK = 'ORD-17';

/** A plan-shaped route: the S2–S5 and S10–S14 mechanisms run on it until the real plan route ships (step 06). */
export const PLAN = `skill: plan
version: 3
exits: [done, blocked, human, inconclusive, superseded]
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
      acting: [Accept, Revise]
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
      await ledger.append({ kind: 'worker', worker: 'plan-check', outcome: 'ran', ms: 1, artifact: 'workers/x.json', summary: { failed: !state.checkOk, anchorsBad: state.checkOk ? 0 : 1 } });
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

/** The shipped `routes/plan/plan.yaml` with its step texts and the real handlers; `state` is then left untouched. */
async function shippedRoute(): Promise<{ plan: string; step: Record<string, string>; handlers: Record<string, Handler> }> {
  const step: Record<string, string> = {};
  for (const name of ['plan/fetch', 'plan/design', 'plan/write']) step[`routes/${name}.md`] = await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8');
  return { plan: await readFile(path.join(REPO_ROOT, 'routes', 'plan', 'plan.yaml'), 'utf8'), step, handlers: skillHandlers() };
}

export async function planFixture(options: { extra?: Record<string, string>; handlers?: Record<string, Handler>; config?: string; shipped?: boolean } = {}): Promise<PlanFixture> {
  const state: PlanState = { checkOk: true, checks: 0, steps: 0 };
  const shipped = options.shipped === true ? await shippedRoute() : null;
  const fx = await routeFixture({
    routes: { plan: shipped?.plan ?? PLAN, ...(options.extra ?? {}) },
    handlers: { ...(shipped?.handlers ?? planHandlers(state)), ...(options.handlers ?? {}) },
    ...(shipped === null ? {} : { step: shipped.step }),
    ...(options.config === undefined ? {} : { config: options.config }),
  });
  if (shipped !== null) {
    await fx.repo.write('src/orders/limit.ts', 'export function orderLimit(total: number): number {\n  return total;\n}\n');
    await fx.repo.commitAll('orders');
  }
  const start = (input: Partial<StartInput> = {}) =>
    fx.engine.start({ skill: 'plan', text: 'add a limit', requirements: [], task: PLAN_TASK, cwd: fx.repo.root, session: SESSION_A, channel: 'hook', scratchpadDir: fx.scratchpad, ...input });
  const next = (input: Partial<AdvanceInput> = {}) => fx.engine.advance({ task: PLAN_TASK, session: SESSION_A, cause: 'route-next', scratchpadDir: fx.scratchpad, ...input });
  const body = async (text: string, task = PLAN_TASK): Promise<void> => {
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
    async saveDraft(text, session = SESSION_A) {
      await body(text);
      return saveNote({ runtime: fx.runtime, session, context: commandContext({ runtime: fx.runtime, routes: fx.routes }) }, { task: PLAN_TASK, kind: 'plan-draft', body: null, from: 'steps/plan-body.md', iteration: null });
    },
    promote: (session = SESSION_A) => promotePlan({ runtime: fx.runtime, session, context: commandContext({ runtime: fx.runtime, routes: fx.routes }) }, PLAN_TASK),
    async toGate(input = {}) {
      await start(input);
      await next();
      await body('# Plan\n\n1. Do it.\n');
      return next();
    },
    prints: (task = PLAN_TASK) => fx.kinds(task, 'gate'),
    dispose: () => fx.dispose(),
  };
}
