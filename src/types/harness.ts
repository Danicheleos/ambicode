import type { TypedEntry } from '#modules/evidence/ledger/kinds';
import type { Runtime } from './composition.ts';
import type { ArtifactRef, LedgerEntry, TaskDir, LockedLedger } from './modules/evidence.ts';

export const EXITS = ['done', 'blocked', 'human', 'inconclusive', 'superseded', 'budget'] as const;

export type Exit = (typeof EXITS)[number];

export interface Qualified { kind: string; value: string | null }

export interface Call { name: string; params: readonly string[] }

export interface Revise { target: string; args: Readonly<Record<string, readonly string[]>> }

export type OnError =
  | { kind: 'default' }
  | { kind: 'retry-with'; hint: string }
  | { kind: 'ask'; gate: string }
  | { kind: 'stop'; reason: Exit };

export type When =
  | { predicate: 'args.hasRequirement' | '!args.hasRequirement' | 'map.empty' | 'plan.isDraft' | 'headless' | 'interactive' | 'index.present' | 'revised' }
  | { predicate: 'gate.answered'; gate: string }
  | { predicate: 'gate.is'; gate: string; option: string };

export interface GateDef {
  id: string;
  class: 'declared' | 'raised' | 'decision';
  question: string;
  options: readonly string[];
  default: string;
  release: string;
  acting: readonly string[];
  onAnswer: Readonly<Record<string, Revise>>;
  maxRevises: number;
  object: Qualified | null;
  policy: Readonly<Record<string, 'stop'>>;
}

export interface Answer { gate: string; option: string; instance?: string; freeText?: boolean }

/** `route start review --branch [--base <ref>] | --mr <url>`; absent for uncommitted work and every other skill (D12). */
export interface ReviewTargetArgs { branch: boolean; base: string | null; mr: string | null }

/** Persisted in the `route` entry's `args` field (03-E8). */
export interface RouteArgs {
  text: string;
  requirements: readonly string[];
  project: string | null;
  plan: string | null;
  fromDraft: string | null;
  answers: readonly string[];
  headless: boolean;
  hasRequirement: boolean;
  target?: ReviewTargetArgs;
  hash: string;
}

/** Every `run` name a shipped route may use; `handlers.ts` registers exactly these and a test keeps the two equal. */
export const HANDLER_NAMES = [
  'requirements.template',
  'requirements.normalize',
  'requirements.acs',
  'search.map',
  'policy.stage',
  'evidence.navigationLine',
  'evidence.notes.save',
  'evidence.notes.promote',
  'workers.planCheck',
  'init.propose',
  'init.close',
  'rules.discover',
  'rules.context',
  'rules.draftsCheck',
  'rules.close',
  'task.start',
  'task.inventory',
  'task.index',
  'task.report',
  'checks.baseline',
  'review.evaluate',
  'review.estimate',
] as const;

export interface StepDef {
  id: string;
  index: number;
  actor: 'code' | 'model' | 'worker' | 'human';
  run: readonly Call[];
  instruction: string | null;
  payload: readonly string[];
  needs: readonly Qualified[];
  produces: readonly Qualified[];
  when: When | null;
  gate: GateDef | null;
  onFail: Revise | null;
  onError: OnError;
  repeat: number;
  /** `note`: the model's final answer is the step's note; the Stop hook saves it. */
  answer: 'note' | null;
}

export interface RouteDef {
  skill: string;
  version: 3;
  /** `toolTurns`: model turns with tool calls at an `answer: note` step before the PostToolUse notice. */
  budget: { modelSteps: number; wallMinutes?: number; toolTurns?: number };
  exits: readonly Exit[];
  revisable: readonly string[];
  steps: readonly StepDef[];
}

export interface RouteRegistry {
  route(skill: string): RouteDef | null;
  skills(): readonly string[];
  gate(id: string): GateDef | null;
  gates(): readonly GateDef[];
}

export type StartChannel = 'hook' | 'cli' | 'harness';

export type CommandName =
  | 'requirements normalize' | 'check' | 'format' | 'review' | 'plan check' | 'policy check --drafts' | 'rules apply' | 'init --apply'
  | 'note save' | 'note promote';

export type Cause = 'route-next' | 'gate-hook' | CommandName;

export type AcceptanceEntry = Extract<TypedEntry, { kind: 'acceptance' }>;

export interface RouteView {
  task: string;
  routeId: string;
  chainIds: readonly string[];
  skill: string;
  session: string;
  mode: 'interactive' | 'headless';
  channel: StartChannel;
  trusted: boolean;
  position: string | 'complete';
}

export type ConsentResult =
  | { state: 'honoured'; source: AcceptanceEntry; object: ArtifactRef | null }
  | { state: 'refused'; reason: 'no-answer' | 'superseded' | 'unbound' | 'acting-needs-human' | 'not-accepted'; source: LedgerEntry | null };

export interface RouteContextPort {
  resolve(task: string, session: string): Promise<RouteView | null>;
  assertOwner(view: RouteView): Promise<void>;
  window(view: RouteView, stepId: string): Promise<readonly LedgerEntry[]>;
  object(view: RouteView, gateId: string): Promise<ArtifactRef | null>;
  consent(view: RouteView, gateId: string, binding?: object): Promise<ConsentResult>;
}

export interface StartInput {
  skill: string;
  text: string;
  requirements: readonly string[];
  task?: string;
  headless?: boolean;
  project?: string;
  answers?: readonly Answer[];
  fresh?: boolean;
  adopt?: boolean;
  cwd: string;
  /** The route's owner: an opaque key the engine only compares. */
  session: string;
  /** The Claude session a hook started it for; recorded on the route and keys the hook's own state. */
  harnessSession?: string;
  channel: StartChannel;
  scratchpadDir?: string;
  /** `--plan <file>`: the plan a task route implements; `--from-draft <file>`: a draft, implemented anyway. */
  plan?: string;
  fromDraft?: string;
  /** Review only (08-R2); part of the args hash when present. */
  target?: ReviewTargetArgs;
}

export interface AdvanceInput {
  task: string;
  session: string;
  answers?: readonly (Answer & { question?: string })[];
  default?: string;
  revise?: string;
  conflict?: { summary: string; sources: readonly string[] };
  project?: string;
  show?: string;
  cause: Cause;
  scratchpadDir?: string;
  /** What the command (`plan check`) already wrote for the code step it reaches; that step consumes it (D1). */
  produced?: readonly string[];
}

export interface StepMessage {
  task: string;
  routeId: string;
  position: string | 'complete';
  text: string;
  file: string | null;
  bytes: number;
  ledgerIds: readonly string[];
}

export interface Position {
  routeId: string;
  skill: string;
  chainIds: readonly string[];
  sessions: readonly { session: string; routeId: string; adopts: boolean }[];
  owner: PlanOwnership | null;
  position: string | 'complete';
  steps: readonly { id: string; state: 'done' | 'pending' | 'skipped'; windowStart: number }[];
  cycles: number;
  repeatsLeft: Readonly<Record<string, number>>;
  revisesLeft: Readonly<Record<string, number>>;
  limits: readonly LedgerEntry[];
  maps: readonly { id: string; layers: readonly unknown[] }[];
  orphans: readonly string[];
}

export interface Engine {
  start(input: StartInput): Promise<StepMessage>;
  advance(input: AdvanceInput): Promise<StepMessage>;
  /** Fold and deliver the session's open route again, writing and running nothing (03-E2). */
  deliver(task: string, session: string, scratchpadDir?: string): Promise<StepMessage | null>;
  status(task: string, session: string | null): Promise<Position[]>;
  stop(task: string, session: string, reason: 'blocked' | 'human' | 'inconclusive' | 'budget', detail?: string, scratchpadDir?: string): Promise<void>;
}

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

export const MARKER = /\[ambicode gate ([\w:.-]+)(?: ([\w-]+))?\]/;

export interface ActiveRoutePointer {
  write(session: string, scratchpad: string | undefined, value: { task: string; skill: string; owner?: string; toolTurns?: number }): Promise<void>;
  clear(session: string, scratchpad: string | undefined): Promise<void>;
  read(session: string, scratchpad: string | undefined): Promise<{ task: string; skill: string; owner?: string } | null>;
  /** Written when exit or completion clears `active-route`; read and removed only by Stop. */
  readEnded(session: string, scratchpad: string | undefined): Promise<{ task: string; skill: string; routeId: string } | null>;
  clearEnded(session: string, scratchpad: string | undefined): Promise<void>;
}

export type PlanOwnership =
  | { task: string; state: 'owned'; session: string; routeId: string; chainIds: string[]; takenOver: string[] }
  | { task: string; state: 'none' }
  | { task: string; state: 'unknown'; reason: string };

export type SessionBinding =
  | { state: 'bound'; session: string; via: 'hook' | 'env' | 'updated-input' | 'association' | 'task' }
  | { state: 'unbound'; reason: 'missing' | 'stale' | 'ambiguous' };

export const RAISED_BY = '$raisedBy';
