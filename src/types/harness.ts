import type { TypedEntry } from '#platform/ledger/kinds';
import type { Runtime } from './composition.ts';
import type { HookInput, StopHookOutput } from './hook.ts';
import type { ArtifactRef, LedgerEntry, TaskDir, LockedLedger } from './modules/evidence.ts';

export const EXITS = ['done', 'blocked', 'human', 'inconclusive', 'superseded'] as const;

export type Exit = (typeof EXITS)[number];

export interface Qualified { kind: string; value: string | null }

export interface Call { name: string; params: readonly string[] }

export interface Revise { target: string; args: Readonly<Record<string, readonly string[]>> }

export type OnError =
  | { kind: 'default' }
  | { kind: 'stop'; reason: Exit };

export type When =
  | { predicate: 'args.hasRequirement' | 'args.hasMergeRequest' | 'map.empty' | 'plan.isDraft' | 'revised' }
  | { predicate: 'gate.is' | 'gate.isnt'; gate: string; option: string };

export interface GateDef {
  id: string;
  class: 'declared' | 'raised' | 'decision';
  question: string;
  options: readonly string[];
  default: string;
  acting: readonly string[];
  onAnswer: Readonly<Record<string, Revise>>;
  /** Human revises through this gate before it declines the next one (the one counter: a step's `repeat`). */
  repeat: number;
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

/** Every `run` name a shipped route may use; `handlers.ts` registers exactly these and `src/skills/handlers.test.ts` keeps the two equal. */
export const HANDLER_NAMES = [
  'script',
  'requirements.normalize',
  'search.map',
  'policy.stage',
  'evidence.navigationLine',
  'evidence.notes.save',
  'evidence.notes.promote',
  'init.propose',
  'init.close',
  'task.start',
  'task.report',
  'checks.baseline',
  'checks.preflight',
  'review.evaluate',
  'review.command',
  'review.estimate',
  'review.publishList',
] as const;

export interface StepDef {
  id: string;
  index: number;
  actor: 'code' | 'model' | 'human';
  run: readonly Call[];
  instruction: string | null;
  payload: readonly string[];
  produces: readonly Qualified[];
  when: When | null;
  gate: GateDef | null;
  onFail: Revise | null;
  onError: OnError;
  repeat: number;
  /** The model's final message is this step's work; the next prompt closes the route. */
  final: boolean;
}

export interface RouteDef {
  skill: string;
  version: 3;
  revisable: readonly string[];
  steps: readonly StepDef[];
}

export interface RouteRegistry {
  route(skill: string): RouteDef | null;
  skills(): readonly string[];
  gate(id: string): GateDef | null;
  gates(): readonly GateDef[];
}

export type StartChannel = 'hook' | 'cli';

export type CommandName =
  | 'requirements normalize' | 'check' | 'format' | 'review' | 'policy check --drafts' | 'rules apply' | 'init --apply' | 'init propose'
  | 'note save' | 'note promote' | 'review record';

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

/** What a guarded command may ask of the route it speaks for; the engine builds it, modules only read through it. */
export interface CommandContext {
  resolve(task: string, session: string): Promise<RouteView | null>;
  /** Like `resolve`, but null once the route has ended. */
  open(task: string, session: string): Promise<RouteView | null>;
  assertOwner(view: RouteView): Promise<void>;
  window(view: RouteView, stepId: string): Promise<readonly LedgerEntry[]>;
  object(view: RouteView, gateId: string): Promise<ArtifactRef | null>;
  consent(view: RouteView, gateId: string, binding?: object): Promise<ConsentResult>;
  /** The task ledger, read strictly. */
  entries(task: string): Promise<LedgerEntry[]>;
  /** Prints a raised gate for the route, under the caller's ledger lock. */
  raise(ledger: LockedLedger, view: RouteView, input: { gate: string; values: Readonly<Record<string, readonly string[]>>; raisedBy: string; openAt?: string }): Promise<LedgerEntry>;
}

/** One guarded command a skill declares: `owned` refuses unless exactly one live route binds the call to an owner. */
export interface GuardedCommand {
  name: string;
  skill: string;
  route: 'optional' | 'owned';
}

export interface CommandScope {
  task: string;
  /** The owner of the task's one live route, null when none or several. */
  session: string | null;
  binding: SessionBinding;
  /** The session's open route, null without one. */
  view: RouteView | null;
  context: CommandContext;
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
  revise?: string;
  project?: string;
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

export interface Engine {
  start(input: StartInput): Promise<StepMessage>;
  advance(input: AdvanceInput): Promise<StepMessage>;
  /** Fold and deliver the session's open route again, writing and running nothing (03-E2). */
  deliver(task: string, session: string, scratchpadDir?: string): Promise<StepMessage | null>;
  /** Stop: the checks on the final message under one ledger lock and the single block they may cause. */
  stopHook(input: HookInput, options?: { defectBrief?: boolean }): Promise<StopHookOutput | null>;
  /** Ends the session's open route with an `exit` entry and clears its pointer. */
  stop(task: string, session: string, reason: Exit, detail?: string, scratchpadDir?: string): Promise<void>;
  /** Whether the task has a route no exit has closed. */
  live(task: string): Promise<boolean>;
  /** Runs a guarded command's body with the route the call speaks for resolved and its context supplied. */
  command<T>(spec: GuardedCommand, request: { task: string }, body: (scope: CommandScope) => Promise<T>): Promise<T>;
}

export interface HandlerInput {
  view: RouteView;
  context: CommandContext;
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
  | { state: 'ok'; payload: string | null; record?: Readonly<Record<string, unknown>>; exit?: string; exitDetail?: string }
  | { state: 'failed'; code: string; message: string; recoverable: boolean; revise?: { args: Readonly<Record<string, readonly string[]>>; lastRound?: string } }
  | { state: 'raise'; gate: string; values: Readonly<Record<string, readonly string[]>>; raisedBy?: string };

export type Handler = (input: HandlerInput) => Promise<HandlerResult>;

export interface HandlerRegistry {
  get(name: string): Handler | null;
  names(): readonly string[];
}

export const MARKER = /\[ambicode gate ([\w:.-]+)(?: ([\w-]+))?\]/;

export interface ActiveRoutePointer {
  write(session: string, scratchpad: string | undefined, value: { task: string; skill: string; owner?: string; headless?: boolean }): Promise<void>;
  clear(session: string, scratchpad: string | undefined): Promise<void>;
  read(session: string, scratchpad: string | undefined): Promise<{ task: string; skill: string; owner?: string } | null>;
}

export type PlanOwnership =
  | { task: string; state: 'owned'; session: string; routeId: string; chainIds: string[] }
  | { task: string; state: 'none' }
  | { task: string; state: 'unknown'; reason: string };

export type SessionBinding =
  | { state: 'bound'; session: string; via: 'hook' | 'task' }
  | { state: 'unbound'; reason: 'missing' | 'stale' | 'ambiguous' };

export const RAISED_BY = '$raisedBy';
