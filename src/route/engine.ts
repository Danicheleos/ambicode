import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import type { Runtime } from '../composition/root.ts';
import { TASKS_DIR } from '../config/defaults.ts';
import { loadConfigWithNotices } from '../config/load.ts';
import { indexDepsOf, startIndexBuild } from '../code-intelligence/index/codeindex.ts';
import { Git } from '../git/git.ts';
import { raiseConflict } from '../requirements/conflict.ts';
import { hasRequirement } from '../requirements/has-requirement.ts';
import type { LedgerEntry } from '../task/ledger.ts';
import { withLedgerLock, type LockedLedger } from '../task/ledger-lock.ts';
import { buildReport } from '../task/report.ts';
import { mintTaskSlug } from '../task/slug.ts';
import { excludeWorkingDirs, resolveTaskDir, type TaskDir } from '../task/task-dir.ts';
import { AmbicodeError } from '../util/errors.ts';
import { contentHash } from '../util/hash.ts';
import { endRoute, markStepDelivered, type ActiveRoutePointer } from './active-route.ts';
import { exitRoute, recordDefaultFlag, recordFlagAnswer, recordHookAnswer, reviseTo, serviceGate } from './answers.ts';
import { checkOwner, ledgerRouteContext, ledgerUnreadable, readEntries, type Cause, type StartChannel } from './context.ts';
import { entryPaths } from '../requirements/capture-files.ts';
import { chainKey, compose, loadPayload, savePayload, stepHeader, writeStepFile, type Composed, type DeliveryChannel } from './delivery.ts';
import type { Exit, GateDef } from './dsl.ts';
import { canonicalArgs, type Answer, type RouteArgs } from './flags.ts';
import { buildChain, currentIn, exitOf, executions, foldRoute, humanRevisesLeft, latestRouteOf, liveHeads, modelDeliveries, windowOf, matches } from './fold.ts';
import { harnessOf } from './harness.ts';
import { gatePrintText, gateThen, raiseGate, raisedAnswerHandler } from './gates.ts';
import { payloadKey, type HandlerRegistry } from './handlers.ts';
import { ownerOf, type PlanOwnership } from './ownership.ts';
import type { RouteRegistry, StepDef } from './routes.ts';
import { append, chainOf, gateFor, latestPrint, viewFor, type Run } from './run-context.ts';

export type { Answer } from './flags.ts';

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

export interface EngineDeps { runtime: Runtime; routes: RouteRegistry; handlers: HandlerRegistry; pointer: ActiveRoutePointer; startIndex?: typeof startIndexBuild }

const inside = new AsyncLocalStorage<true>();
/** Handlers run inside the engine; a command tail started from one would advance twice (03-T3). */
export const insideEngine = (): boolean => inside.getStore() === true;

const MAX_TURNS = 200;
const DEFAULT_WALL_MINUTES = 45;
const OWNING_SKILLS: ReadonlySet<string> = new Set(['plan']);
const EXPLICIT: ReadonlySet<string> = new Set(['route-next', 'requirements normalize', 'check', 'format', 'review', 'plan check', 'policy check --drafts', 'rules apply', 'init --apply', 'note save', 'note promote']);

interface Part { text: string; file: string | null; bytes: number; position: string | 'complete'; full: string }

const quiet = (value: unknown): string => String(value ?? '');

export function createEngine(deps: EngineDeps): Engine {
  const { runtime, routes, handlers, pointer, startIndex = startIndexBuild } = deps;
  const context = ledgerRouteContext({ runtime, routes });
  const now = (): Date => runtime.clock.now();
  const cli = `node "${runtime.pluginRoot}/scripts/ambicode.mjs"`;

  const unreadable = (task: string, reason: string): AmbicodeError => ledgerUnreadable(task, reason);

  async function readStrict(ledger: LockedLedger, task: string): Promise<LedgerEntry[]> {
    const read = await ledger.read();
    if (read.state === 'unreadable') throw unreadable(task, read.reason);
    return read.state === 'ok' ? read.entries : [];
  }

  function newRun(input: { runtime: Runtime; def: Run['def']; task: string; dir: TaskDir; ledger: LockedLedger; entries: LedgerEntry[]; head: LedgerEntry; session: string; stateKey: string; cause: string; channel: DeliveryChannel; scratchpadDir?: string; deliverOnly?: boolean }): Run {
    const written: string[] = [];
    const tracked: LockedLedger = {
      append: async (entry) => {
        const stored = await input.ledger.append(entry.kind === 'route' ? entry : { route: input.head.id, ...entry });
        input.entries.push(stored);
        written.push(stored.id);
        return stored;
      },
      read: () => input.ledger.read(),
    };
    return {
      runtime: input.runtime,
      routes,
      def: input.def,
      task: input.task,
      dir: input.dir,
      ledger: tracked,
      entries: input.entries,
      head: input.head,
      session: input.session,
      stateKey: input.stateKey,
      cause: input.cause,
      channel: input.channel,
      scratchpadDir: input.scratchpadDir,
      deliverOnly: input.deliverOnly ?? false,
      written,
      notes: [],
      exited: null,
    };
  }

  const commandFor = (tail: string): string => `${cli} ${tail}`;

  const answerLine = (step: StepDef): string => `answer the user; your answer is saved as the ${step.produces.find((produced) => produced.kind === 'note')?.value ?? ''} note when you stop`;

  function producerHint(run: Run, step: StepDef): string {
    if (step.answer === 'note') return answerLine(step);
    const note = step.produces.find((produced) => produced.kind === 'note');
    if (note?.value) return commandFor(`note save --task ${run.task} --kind ${note.value}`);
    return commandFor(`route next --task ${run.task}`);
  }

  function endingCommand(run: Run, step: StepDef): string {
    if (step.answer === 'note') return answerLine(step);
    const note = step.produces.find((produced) => produced.kind === 'note');
    if (step.actor === 'model' && note?.value) return `${commandFor(`note save --task ${run.task} --kind ${note.value}`)} (note on standard input)`;
    return commandFor(`route next --task ${run.task}`);
  }

  function messageOf(run: Run, part: Part): StepMessage {
    return { task: run.task, routeId: run.head.id, position: part.position, text: part.text, file: part.file, bytes: part.bytes, ledgerIds: [...run.written] };
  }

  async function partOf(run: Run, step: StepDef | null, header: string, body: string): Promise<{ part: Part; composed: Composed }> {
    const notes = run.notes.length === 0 ? '' : `${run.notes.join('\n')}\n\n`;
    const composed = compose({ header, body: `${notes}${body}`.trimEnd(), channel: run.channel, dir: run.dir, step: step?.id ?? 'complete', chain: chainKey([...chainOf(run).ids]) });
    return { part: { text: composed.text, file: composed.file, bytes: composed.bytes, position: step?.id ?? 'complete', full: composed.full }, composed };
  }

  // ---------------------------------------------------------------- completion

  async function finish(run: Run): Promise<Part> {
    const chain = chainOf(run);
    let status: string;
    const ended = exitOf(chain);
    if (ended !== null && ended['complete'] !== true) {
      status = `ended: ${ended['reason']}${ended['detail'] === undefined ? '' : ` (${quiet(ended['detail'])})`}`;
    } else {
      // A completion that leaves anything unverified is not an exit: a late bound answer can still change it (S12).
      const items = buildReport(chain.entries, { current: currentIn(run.def, chain) }).notVerified.split('\n').filter((line, index) => index > 0 && line.trim() !== 'none recorded' && line.trim() !== '' && !line.endsWith(' (historical)')).length;
      if (items === 0 && ended === null) await exitRoute(run, 'done', undefined, { complete: true, unverified: 0 });
      status = items === 0 ? 'complete' : `complete, ${items} items not verified`;
    }
    const header = `[ambicode] ${run.def.skill} · task ${run.task} · ${status}`;
    // A route that ends on a code step (init, rules) closes with that step's text.
    const last = run.def.steps.at(-1);
    const closing = last?.actor === 'code' && ended === null ? (await Promise.all(last.run.map((call) => loadPayload(run.runtime.fs, run.dir, chainKey([...chain.ids]), payloadKey(call))))).filter((text) => text !== null && text.trim() !== '').join('\n\n') : '';
    return (await partOf(run, null, header, closing !== '' ? closing : status.startsWith('ended') ? 'The route has ended.' : 'The route is complete. Nothing further is required of you.')).part;
  }

  // ---------------------------------------------------------------- one advance

  function wallExceeded(run: Run): boolean {
    if (run.head['mode'] !== 'headless') return false;
    const first = chainOf(run).entries.find((entry) => entry.kind === 'route')!;
    return now().getTime() - Date.parse(first.at) > (run.def.budget.wallMinutes ?? DEFAULT_WALL_MINUTES) * 60_000;
  }

  function openRaisedGate(run: Run, step: StepDef): GateDef | null {
    const entries = chainOf(run).entries;
    const print = entries.findLast((entry) => entry.kind === 'gate' && entry['raisedBy'] === step.id && entry['class'] !== 'declared');
    if (print === undefined) return null;
    const answered = entries.slice(entries.indexOf(print) + 1).some((entry) => ['acceptance', 'default-taken', 'declined'].includes(entry.kind) && entry['gate'] === print['gate'] && entry['unbound'] !== true && entry['reason'] !== 'acting-needs-human' && entry['reason'] !== 'option-not-offered');
    return answered ? null : gateFor(run, String(print['gate']), print);
  }

  async function gatePart(run: Run, step: StepDef, outcome: Extract<Awaited<ReturnType<typeof serviceGate>>, { state: 'print' }>): Promise<Part> {
    const { gate, print } = outcome;
    const declared = run.def.steps.find((candidate) => candidate.gate?.id === gate.id);
    const left = Object.keys(gate.onAnswer).length === 0 ? null : humanRevisesLeft(chainOf(run).entries, gate);
    const text = gatePrintText({ task: run.task, gate, entry: print, object: (print['object'] as never) ?? null, revisesLeft: left, retry: outcome.retry, runner: cli });
    const position = (declared ?? step).id;
    const header = stepHeader({ skill: run.def.skill, task: run.task, step: position, position: (declared ?? step).index + 1, total: run.def.steps.length, now: `Put this question to the user: ${gate.question}`, then: gateThen(run.task, cli) });
    return (await partOf(run, declared ?? step, header, text)).part;
  }

  async function runCode(run: Run, step: StepDef, fold: ReturnType<typeof foldRoute>): Promise<Part | null> {
    const window = windowOf(fold, step);
    const missing = step.needs.filter((need) => !window.some((entry) => matches(entry, need)));
    if (missing.length > 0) {
      const names = missing.map((need) => `${need.kind}${need.value === null ? '' : `{${need.value}}`}`);
      throw new AmbicodeError('route-needs-unmet', `Step ${step.id} needs ${names.join(', ')}, which is not on record.`, {
        details: missing.map((need) => `${need.kind} is written by ${run.def.steps.find((candidate) => candidate.produces.some((produced) => produced.kind === need.kind))?.id ?? 'an earlier step'}.`),
      });
    }
    const start = fold.steps[step.index]!.windowStart;
    const reviseEntry = start > 0 ? fold.chain.entries[start - 1] : undefined;
    const revise = reviseEntry?.kind === 'revise' ? { args: (reviseEntry['args'] ?? {}) as Record<string, string[]> } : null;
    const view = viewFor(run, step.id);
    const args = (run.head['args'] ?? {}) as RouteArgs;
    for (const call of step.run) {
      const handler = handlers.get(call.name);
      if (handler === null) throw new AmbicodeError('internal', `No handler "${call.name}" is registered.`);
      const result = await handler({ view, context, dir: run.dir, args, params: call.params, ledger: run.ledger, runtime: run.runtime, raisedBy: step.id, revise });
      if (result.state === 'ok') {
        // An empty file, not none: a payload left by an earlier run of this step in the chain would be delivered again.
        await savePayload(run.runtime.fs, run.dir, chainKey(view.chainIds), payloadKey(call), result.payload ?? '');
        continue;
      }
      if (result.state === 'raise') {
        await raiseGate(run.ledger, view, { gate: result.gate, values: result.values, raisedBy: step.id }, routes);
        return null;
      }
      return failure(run, step, result);
    }
    const recorded = windowOf(foldRoute(run.def, chainOf(run)), step);
    const unmet = step.produces.filter((produced) => !recorded.some((entry) => matches(entry, produced)));
    if (unmet.length > 0) {
      const names = unmet.map((need) => `${need.kind}${need.value === null ? '' : `{${need.value}}`}`);
      return failure(run, step, { code: 'route-produces-missing', message: `Step ${step.id} ran but did not record ${names.join(', ')}.`, recoverable: false });
    }
    await append(run, { kind: 'step', step: step.id, actor: 'code', status: 'completed', cause: run.cause });
    return null;
  }

  async function failure(run: Run, step: StepDef, result: { code: string; message: string; recoverable: boolean }): Promise<Part | null> {
    const window = windowOf(foldRoute(run.def, chainOf(run)), step);
    const earlier = window.filter((entry) => entry.kind === 'step' && entry['step'] === step.id && entry['status'] === 'failed' && entry['code'] === result.code).length;
    await append(run, { kind: 'step', step: step.id, actor: 'code', status: 'failed', cause: run.cause, code: result.code, message: result.message.slice(0, 300) });
    if (step.onFail !== null) {
      // The step ran and its result is on record; the failure is what the route wants redone (S4).
      await append(run, { kind: 'step', step: step.id, actor: 'code', status: 'completed', cause: run.cause, failed: true });
      await reviseTo(run, step.onFail, 'code', { reason: `${step.id}: ${result.code}`, raisedBy: step.id });
      return null;
    }
    const error = step.onError;
    if (error.kind === 'stop') {
      await exitRoute(run, error.reason, `${result.code}: ${result.message.slice(0, 200)}`);
      return finish(run);
    }
    if (error.kind === 'ask') {
      await raiseGate(run.ledger, viewFor(run, step.id), { gate: error.gate, values: {}, raisedBy: step.id }, routes);
      return null;
    }
    const repeated = earlier + 1 >= 2;
    if (repeated) await append(run, { kind: 'limit', which: 'same-error', step: step.id, count: earlier + 1, code: result.code });
    const recent = chainOf(run).entries.filter((entry) => entry.kind === 'step').slice(-3);
    if (recent.length === 3 && recent.every((entry) => entry['step'] === step.id && entry['status'] === 'failed')) await append(run, { kind: 'limit', which: 'identical-next', step: step.id, count: 3 });
    const stop = repeated ? [`The same error twice: if you cannot fix it, run \`${commandFor(`route stop --task ${run.task} --reason blocked`)}\`.`] : [];
    throw new AmbicodeError(result.code, result.message, { details: [...(error.kind === 'retry-with' ? [error.hint] : []), ...stop] });
  }

  async function runModel(run: Run, step: StepDef, fold: ReturnType<typeof foldRoute>): Promise<Part | null> {
    const window = windowOf(fold, step);
    const delivered = window.some((entry) => entry.kind === 'step' && entry['step'] === step.id && entry['status'] === 'delivered');
    const chain = chainOf(run);
    let prefix = '';
    if (!run.deliverOnly && delivered && step.produces.length > 0 && step.answer === null && EXPLICIT.has(run.cause)) {
      const again = window.filter((entry) => entry.kind === 'step' && entry['step'] === step.id && entry['status'] === 'repeated').length + 1;
      const missing = step.produces.filter((produced) => !window.some((entry) => matches(entry, produced))).map((produced) => `${produced.kind}${produced.value === null ? '' : `{${produced.value}}`}`);
      if (again >= 3) {
        await append(run, { kind: 'limit', which: 'missing-produces', step: step.id, count: again });
        return null;
      }
      await append(run, { kind: 'step', step: step.id, actor: 'model', status: 'repeated', cause: run.cause });
      prefix = `Not done yet: ${missing.join(', ')} is not on record. Produce it with: ${producerHint(run, step)}.${again === 2 ? ` Or stop: ${commandFor(`route stop --task ${run.task} --reason blocked`)}.` : ''}\n\n`;
    }
    if (!delivered) {
      const spent = modelDeliveries(run.def, chain.entries);
      const continues = chain.entries.filter((entry) => entry.kind === 'acceptance' && entry['gate'] === 'budget-exhausted' && entry['answer'] === 'continue').length;
      if (spent + 1 > run.def.budget.modelSteps * (1 + continues)) {
        await raiseGate(run.ledger, viewFor(run, step.id), { gate: 'budget-exhausted', values: {}, raisedBy: step.id }, routes);
        return null;
      }
    }
    const instruction = step.instruction!.replaceAll('{cli}', cli).replaceAll('{task}', run.task);
    const nowLine = instruction.split('\n').find((line) => line.trim() !== '')!.replace(/^#+\s*/, '');
    // The header's `Now:` already carries a plain first line; a heading stays, it is the shape the step asks for.
    const body = /^\s*#/.test(instruction) || nowLine.replace(/\s+/g, ' ').trim().length > 160 ? instruction : instruction.replace(/^\s*[^\n]*\n?/, '').trimStart();
    const sections: string[] = body === '' ? [] : [body];
    const start = fold.steps[step.index]!.windowStart;
    const reviseEntry = start > 0 ? fold.chain.entries[start - 1] : undefined;
    const reviseArgs = reviseEntry?.kind === 'revise' ? (reviseEntry['args'] as Record<string, string[]> | undefined) : undefined;
    for (const [key, values] of Object.entries(reviseArgs ?? {})) {
      if (values.length > 0) sections.push(`## ${key}\n${values.join('\n')}`);
    }
    for (const key of step.payload) {
      const payload = await loadPayload(run.runtime.fs, run.dir, chainKey([...chainOf(run).ids]), key);
      if (payload !== null && payload.trim() !== '') sections.push(`## ${key}\n${payload}`);
    }
    const header = stepHeader({ skill: run.def.skill, task: run.task, step: step.id, position: step.index + 1, total: run.def.steps.length, now: nowLine, then: endingCommand(run, step) });
    const { part, composed } = await partOf(run, step, header, `${prefix}${sections.join('\n\n')}`);
    if (!delivered) {
      const entry = await append(run, { kind: 'step', step: step.id, actor: 'model', status: 'delivered', cause: run.cause, channel: run.channel, bytes: part.bytes, ...(part.file === null ? {} : { file: part.file }) });
      await writeStepFile(run.runtime.fs, composed, `ambicode step: ${run.def.skill}/${step.id}, task ${run.task}, ${part.bytes} bytes, ${entry.id}`);
    } else {
      await writeStepFile(run.runtime.fs, composed, `ambicode step: ${run.def.skill}/${step.id}, task ${run.task}, ${part.bytes} bytes`);
    }
    return part;
  }

  async function writeSkips(run: Run, fold: ReturnType<typeof foldRoute>): Promise<void> {
    for (const state of fold.steps) {
      if (state.state !== 'skipped') continue;
      const window = fold.chain.entries.slice(state.windowStart);
      if (window.some((entry) => entry.kind === 'step' && entry['step'] === state.step.id && entry['status'] === 'skipped')) continue;
      await append(run, { kind: 'step', step: state.step.id, actor: state.step.actor, status: 'skipped', cause: run.cause });
    }
  }

  /** An accepted raised-gate answer whose effect an interrupted advance did not record; the handlers are idempotent per acceptance. */
  async function applyRaisedAnswers(run: Run): Promise<void> {
    for (const entry of chainOf(run).entries) {
      if (entry.kind === 'acceptance') await raisedAnswerHandler(String(entry['gate']))?.({ view: viewFor(run, ''), ledger: run.ledger, acceptance: entry });
    }
  }

  /** Steps 2–6 of 12 §8: fold, check, run what is reachable, record, deliver. */
  async function execute(run: Run): Promise<Part> {
    if (!run.deliverOnly) await applyRaisedAnswers(run);
    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      if (run.exited !== null) return finish(run);
      const fold = foldRoute(run.def, chainOf(run));
      if (!run.deliverOnly) await writeSkips(run, fold);
      const step = fold.position;
      if (step === null) return finish(run);
      if (wallExceeded(run)) {
        await exitRoute(run, 'budget', 'wallMinutes');
        return finish(run);
      }
      const open = openRaisedGate(run, step);
      if (open !== null) {
        const outcome = await serviceGate(run, open, step.id);
        if (outcome.state === 'print') return gatePart(run, step, outcome);
        continue;
      }
      if (step.actor === 'code') {
        if (run.deliverOnly) {
          const header = stepHeader({ skill: run.def.skill, task: run.task, step: step.id, position: step.index + 1, total: run.def.steps.length, now: `Step ${step.id} has not run yet.`, then: `${cli} route next --task ${run.task}` });
          return (await partOf(run, step, header, '')).part;
        }
        const part = await runCode(run, step, fold);
        if (part !== null) return part;
      } else if (step.actor === 'model') {
        const part = await runModel(run, step, fold);
        if (part !== null) return part;
      } else if (step.actor === 'human') {
        const outcome = await serviceGate(run, step.gate!, step.id);
        if (outcome.state === 'print') return gatePart(run, step, outcome);
      } else {
        throw new AmbicodeError('internal', `Step ${step.id} is a worker step; workers ship in a later release.`);
      }
    }
    throw new AmbicodeError('internal', `Route ${run.def.skill} did not settle within ${MAX_TURNS} turns.`);
  }

  /** A hook-launched route remembers its Claude scratchpad, so a CLI call without one uses the same state files. */
  function scratchOf(head: LedgerEntry, given: string | undefined): { scratchpadDir?: string } {
    const dir = given ?? (typeof head['scratchpad'] === 'string' ? head['scratchpad'] : undefined);
    return dir === undefined ? {} : { scratchpadDir: dir };
  }

  async function closePointer(run: Run, part: Part): Promise<void> {
    if (part.position === 'complete' || run.exited !== null || exitOf(chainOf(run)) !== null) {
      await endRoute(pointer, run.runtime.fs, run.stateKey, run.scratchpadDir, { task: run.task, skill: run.def.skill, routeId: run.head.id });
    } else {
      const answering = run.def.steps.find((step) => step.id === part.position)?.answer === 'note';
      const toolTurns = answering ? run.def.budget.toolTurns : undefined;
      await pointer.write(run.stateKey, run.scratchpadDir, { task: run.task, skill: run.def.skill, owner: run.session, ...(toolTurns === undefined ? {} : { toolTurns }) });
      await markStepDelivered(run.runtime.fs, run.runtime.ids, { session: run.stateKey, scratchpad: run.scratchpadDir, routeId: run.head.id, position: part.position });
    }
  }

  // ---------------------------------------------------------------- start

  function validateAnswers(def: Run['def'], answers: readonly Answer[]): void {
    for (const answer of answers) {
      const declared = def.steps.find((step) => step.gate?.id === answer.gate)?.gate;
      const gate = declared ?? routes.gate(answer.gate);
      if (gate === null || gate === undefined) {
        throw new AmbicodeError('gate-unknown', `Route ${def.skill} has no gate "${answer.gate}".`, {
          details: [`Gates of this route: ${def.steps.filter((step) => step.gate !== null).map((step) => step.id).join(', ') || 'none'}.`, `Registry gates: ${routes.gates().map((candidate) => candidate.id).join(', ')}.`],
        });
      }
      if (gate.class !== 'decision' && !gate.options.includes(answer.option) && !gate.options.some((option) => /\{.*\}/.test(option))) {
        throw new AmbicodeError('gate-option-unknown', `Gate ${gate.id} has no option "${answer.option}".`, { details: [`Options: ${gate.options.join(', ')}.`] });
      }
    }
  }

  async function supersedeIn(rt: Runtime, task: string, session: string, stateKey: string, scratchpadDir: string | undefined): Promise<void> {
    const dir = await resolveTaskDir(rt, task);
    await withLedgerLock(rt.fs, dir.root, now, session, async (ledger) => {
      const read = await ledger.read();
      if (read.state !== 'ok') return;
      const head = latestRouteOf(read.entries, session);
      if (head === null || exitOf(buildChain(read.entries, head)) !== null) return;
      await ledger.append({ kind: 'exit', route: head.id, reason: 'superseded', detail: 'another route started in this session' });
    });
    if ((await pointer.read(stateKey, scratchpadDir))?.task === task) await pointer.clear(stateKey, scratchpadDir);
  }

  async function supersedeElsewhere(rt: Runtime, dir: TaskDir, session: string, stateKey: string, scratchpadDir: string | undefined): Promise<void> {
    const tasksRoot = path.join(dir.repositoryRoot, TASKS_DIR);
    const pointed = await pointer.read(stateKey, scratchpadDir);
    const candidates = new Set<string>();
    if (pointed !== null) candidates.add(pointed.task);
    for (const entry of await rt.fs.readdir(tasksRoot).catch(() => [])) if (entry.isDirectory()) candidates.add(entry.name);
    for (const task of candidates) {
      if (task === dir.slug) continue;
      await supersedeIn(rt, task, session, stateKey, scratchpadDir).catch((error: unknown) => {
        if (!(error instanceof AmbicodeError)) throw error;
      });
    }
  }

  async function start(input: StartInput): Promise<StepMessage> {
    const def = routes.route(input.skill);
    if (def === null) {
      throw new AmbicodeError('route-unknown', `No route ships for "${input.skill}".`, { details: [`Shipped routes: ${routes.skills().join(', ') || 'none'}.`] });
    }
    const answers = input.answers ?? [];
    validateAnswers(def, answers);
    const rt: Runtime = input.cwd === runtime.cwd ? runtime : { ...runtime, cwd: input.cwd };
    const trusted = input.channel !== 'cli';
    const headless = input.headless === true;

    const slug = input.task ?? (input.skill === 'init' ? `init-${now().toISOString().slice(0, 10)}` : (mintTaskSlug([...input.requirements, input.text].join(' ')) ?? `task-${contentHash(`${input.cwd}${now().toISOString()}`).slice(7, 15)}`));
    const dir = await resolveTaskDir(rt, slug);
    await excludeWorkingDirs(rt, dir.repositoryRoot);
    const config = input.skill === 'init' ? null : (await loadConfigWithNotices(rt.fs, dir.repositoryRoot)).config;
    const args = canonicalArgs({
      text: input.text,
      requirements: input.requirements,
      project: input.project ?? null,
      answers,
      headless,
      hasRequirement: hasRequirement({ text: input.text, requirements: input.requirements, headless }, { mcpServer: config?.requirements.mcpServer ?? null }),
    });
    const delivery: DeliveryChannel = input.channel === 'hook' ? 'hook' : 'cli';

    const result = await withLedgerLock(rt.fs, dir.root, now, input.session, async (ledger): Promise<{ message: StepMessage; run: Run; part: Part }> => {
      const entries = await readStrict(ledger, slug);
      const owning = OWNING_SKILLS.has(def.skill);
      const owner = owning ? ownerOf(entries, slug) : null;
      if (owner?.state === 'unknown') throw unreadable(slug, owner.reason);
      const heads = liveHeads(entries).filter((head) => head['skill'] === def.skill);
      const mine = heads.filter((head) => head['session'] === input.session).at(-1);
      const others = heads.filter((head) => head['session'] !== input.session);

      let resumes: LedgerEntry | undefined;
      let adopts = false;
      let reprint: LedgerEntry | undefined;
      const toSupersede: LedgerEntry[] = [];
      const busy = owner?.state === 'owned' && owner.session !== input.session;
      if (busy && input.adopt !== true && input.fresh !== true) {
        throw new AmbicodeError('route-busy', `Task ${slug} has a live ${def.skill} route owned by session ${owner.session} (route ${owner.routeId}).`, {
          details: ['Adopt it (--adopt), restart it (--fresh) or continue under another task: --task <slug>-2.'],
        });
      }
      if (input.fresh === true) {
        toSupersede.push(...heads);
      } else if (input.adopt === true && (busy || others.length > 0) && mine === undefined) {
        resumes = busy ? heads.find((head) => head.id === owner.routeId) : others.at(-1);
        adopts = true;
      } else if (mine !== undefined) {
        const same = (mine['args'] as RouteArgs | undefined)?.hash === args.hash;
        if (same) reprint = mine;
        else toSupersede.push(mine);
      } else if (!owning) {
        const same = others.filter((head) => (head['args'] as RouteArgs | undefined)?.hash === args.hash).at(-1);
        if (same !== undefined) resumes = same;
      }
      if (reprint === undefined) {
        for (const other of liveHeads(entries).filter((head) => head['session'] === input.session && head['skill'] !== def.skill)) toSupersede.push(other);
        for (const head of toSupersede) await ledger.append({ kind: 'exit', route: head.id, reason: 'superseded', detail: 'a new route started' });
      }

      let head: LedgerEntry;
      const run = (route: LedgerEntry, deliverOnly: boolean): Run =>
        newRun({ runtime: rt, def, task: slug, dir, ledger, entries, head: route, session: input.session, stateKey: input.harnessSession ?? harnessOf(route) ?? input.session, cause: 'start', channel: delivery, ...(input.scratchpadDir === undefined ? {} : { scratchpadDir: input.scratchpadDir }), deliverOnly });
      if (reprint !== undefined) {
        const reuse = run(reprint, true);
        const part = await execute(reuse);
        return { message: messageOf(reuse, part), run: reuse, part };
      }
      head = await ledger.append({
        kind: 'route',
        skill: def.skill,
        args,
        mode: headless ? 'headless' : 'interactive',
        channel: input.channel,
        trusted,
        session: input.session,
        ...(input.harnessSession === undefined ? {} : { harnessSession: input.harnessSession }),
        ...(input.scratchpadDir === undefined ? {} : { scratchpad: input.scratchpadDir }),
        epoch: 1,
        ...(resumes === undefined ? {} : { resumes: resumes.id }),
        ...(adopts ? { adopts: true } : {}),
      });
      entries.push(head);
      // Detached and best effort: a failure shows later as map's `index:` line, never here (05-B6).
      const project = config === null ? undefined : input.project === undefined || input.project === null ? (config.projects.length === 1 ? config.projects[0] : undefined) : config.projects.find((candidate) => candidate.id === input.project);
      if (config !== null && project !== undefined) await startIndex(indexDepsOf(rt, new Git({ runner: rt.runner, repositoryRoot: dir.repositoryRoot }), dir.repositoryRoot, config), project).catch(() => undefined);
      const active = run(head, false);
      active.written.push(head.id);
      if (resumes !== undefined && !adopts) {
        const step = foldRoute(def, buildChain(entries, head)).position;
        active.notes.push(`Resumed route ${resumes.id} at step ${step?.id ?? 'complete'}; \`${cli} route start ${def.skill} --fresh\` restarts.`);
      }
      for (const answer of answers) {
        const gate = def.steps.find((step) => step.gate?.id === answer.gate)?.gate ?? routes.gate(answer.gate)!;
        if (!trusted && gate.acting.includes(answer.option)) {
          await append(active, { kind: 'declined', gate: gate.id, instance: null, answer: answer.option, via: 'flag', reason: 'acting-needs-human' });
        } else {
          await append(active, { kind: 'preanswer', gate: gate.id, option: answer.option, via: 'prompt', trusted });
        }
      }
      const part = await execute(active);
      return { message: messageOf(active, part), run: active, part };
    });
    await closePointer(result.run, result.part);
    if (!result.run.deliverOnly) await supersedeElsewhere(rt, dir, input.session, result.run.stateKey, input.scratchpadDir);
    return result.message;
  }

  // ---------------------------------------------------------------- advance

  async function advance(input: AdvanceInput): Promise<StepMessage> {
    const dir = await resolveTaskDir(runtime, input.task);
    const result = await withLedgerLock(runtime.fs, dir.root, now, input.session, async (ledger) => {
      const entries = await readStrict(ledger, input.task);
      const head = latestRouteOf(entries, input.session);
      const def = head === null ? null : routes.route(String(head['skill']));
      if (head === null || def === null) {
        throw new AmbicodeError('route-not-open', `Session has no open route on task ${input.task}.`, { details: [`Start one: route start <skill> --task ${input.task}`] });
      }
      const chain = buildChain(entries, head);
      const view = { task: input.task, routeId: head.id, chainIds: [...chain.ids], skill: def.skill, session: input.session, mode: head['mode'] === 'headless' ? ('headless' as const) : ('interactive' as const), channel: head['channel'] as StartChannel, trusted: head['trusted'] === true, position: '' };
      checkOwner(entries, view);
      const ended = exitOf(chain);
      if (ended !== null) {
        throw new AmbicodeError('route-not-open', `The route on task ${input.task} ended (${quiet(ended['reason'])}).`, { details: [`Start one: route start ${def.skill} --task ${input.task}`] });
      }
      const run = newRun({ runtime, def, task: input.task, dir, ledger, entries, head, session: input.session, stateKey: harnessOf(head) ?? input.session, cause: input.cause, channel: input.cause === 'gate-hook' ? 'hook' : 'cli', ...scratchOf(head, input.scratchpadDir) });
      const position = foldRoute(def, chain).position;
      const raised = input.conflict !== undefined && position !== null
        ? await raiseConflict({ view: viewFor(run, position.id), ledger: run.ledger, summary: input.conflict.summary, sources: input.conflict.sources })
        : null;
      if (raised?.state === 'failed') throw new AmbicodeError(raised.code, raised.message);
      if (position?.actor === 'model' && position.produces.length === 0 && EXPLICIT.has(input.cause)) {
        await append(run, { kind: 'step', step: position.id, actor: 'model', status: 'completed', cause: input.cause });
      }

      for (const answer of input.answers ?? []) {
        if (input.cause === 'gate-hook') await recordHookAnswer(run, answer);
        else await recordFlagAnswer(run, answer);
      }
      if (input.project !== undefined) {
        const open = latestPrint(chainOf(run).entries, 'project-ambiguous');
        if (open !== null) await recordFlagAnswer(run, { gate: 'project-ambiguous', option: input.project });
      }
      if (input.default !== undefined) await recordDefaultFlag(run, input.default);
      if (input.revise !== undefined) {
        if (!def.revisable.includes(input.revise)) {
          throw new AmbicodeError('revise-not-allowed', `Step "${input.revise}" is not revisable in route ${def.skill}.`, { details: [`Revisable steps: ${def.revisable.join(', ') || 'none'}.`] });
        }
        if (!(await reviseTo(run, { target: input.revise, args: {} }, 'model', { reason: 'model requested' }))) run.notes.push(`Revising ${input.revise} was refused: its repeat limit is spent.`);
      }
      if (raised?.state === 'raise' && position !== null) {
        await raiseGate(run.ledger, viewFor(run, position.id), { gate: raised.gate, values: raised.values, raisedBy: position.id }, routes);
      }
      const part = await execute(run);
      return { run, message: messageOf(run, part), part };
    });
    await closePointer(result.run, result.part);
    return result.message;
  }

  async function deliver(task: string, session: string, scratchpadDir?: string): Promise<StepMessage | null> {
    const dir = await resolveTaskDir(runtime, task);
    return withLedgerLock(runtime.fs, dir.root, now, session, async (ledger) => {
      const entries = await readStrict(ledger, task);
      const head = latestRouteOf(entries, session);
      const def = head === null ? null : routes.route(String(head['skill']));
      if (head === null || def === null || exitOf(buildChain(entries, head)) !== null) return null;
      const run = newRun({ runtime, def, task, dir, ledger, entries, head, session, stateKey: harnessOf(head) ?? session, cause: 'resume', channel: 'hook', ...scratchOf(head, scratchpadDir), deliverOnly: true });
      return messageOf(run, await execute(run));
    });
  }

  // ---------------------------------------------------------------- stop and status

  async function stop(task: string, session: string, reason: Exclude<Exit, 'done' | 'superseded'>, detail?: string, scratchpadDir?: string): Promise<void> {
    const dir = await resolveTaskDir(runtime, task);
    const run = await withLedgerLock(runtime.fs, dir.root, now, session, async (ledger) => {
      const entries = await readStrict(ledger, task);
      const head = latestRouteOf(entries, session);
      const def = head === null ? null : routes.route(String(head['skill']));
      if (head === null || def === null || exitOf(buildChain(entries, head)) !== null) {
        throw new AmbicodeError('route-not-open', `Session has no open route on task ${task}.`);
      }
      checkOwner(entries, { task, routeId: head.id, chainIds: [], skill: def.skill, session, mode: 'interactive', channel: 'cli', trusted: false, position: '' });
      const active = newRun({ runtime, def, task, dir, ledger, entries, head, session, stateKey: harnessOf(head) ?? session, cause: 'route-stop', channel: 'cli', ...scratchOf(head, scratchpadDir) });
      await exitRoute(active, reason, detail);
      return active;
    });
    await endRoute(pointer, runtime.fs, run.stateKey, run.scratchpadDir, { task, skill: run.def.skill, routeId: run.head.id });
  }

  async function orphansOf(dir: TaskDir, entries: readonly LedgerEntry[]): Promise<string[]> {
    const named = new Set<string>();
    for (const entry of entries) {
      for (const field of ['path', 'file', 'artifact']) if (typeof entry[field] === 'string') named.add(path.resolve(dir.repositoryRoot, entry[field] as string));
      if (entry.kind === 'requirement' && typeof entry['key'] === 'string') for (const file of entryPaths(dir, entry)) named.add(file);
    }
    const found: string[] = [];
    const walk = async (directory: string): Promise<void> => {
      for (const item of await runtime.fs.readdir(directory).catch(() => [])) {
        const full = path.join(directory, item.name);
        if (item.isDirectory()) await walk(full);
        else if (!['ledger.jsonl', 'ledger.lock'].includes(item.name) && !named.has(full) && !item.name.startsWith('payload-')) found.push(path.relative(dir.root, full));
      }
    };
    await walk(dir.root);
    return found.sort();
  }

  async function status(task: string, session: string | null): Promise<Position[]> {
    const dir = await resolveTaskDir(runtime, task);
    const entries = await readEntries(runtime, task);
    const orphans = await orphansOf(dir, entries);
    const positions: Position[] = [];
    const heads = entries.filter((entry) => entry.kind === 'route');
    const resumed = new Set(heads.map((entry) => entry['resumes']).filter((id): id is string => typeof id === 'string'));
    for (const head of heads.filter((candidate) => !resumed.has(candidate.id))) {
      const def = routes.route(String(head['skill']));
      if (def === null) continue;
      const chain = buildChain(entries, head);
      if (session !== null && !chain.entries.some((entry) => entry.kind === 'route' && entry['session'] === session)) continue;
      if (exitOf(chain) !== null && session === null) continue;
      const fold = foldRoute(def, chain);
      const owning = OWNING_SKILLS.has(def.skill);
      positions.push({
        routeId: head.id,
        skill: def.skill,
        chainIds: [...chain.ids],
        sessions: chain.entries.filter((entry) => entry.kind === 'route').map((entry) => ({ session: String(entry['session']), routeId: entry.id, adopts: entry['adopts'] === true })),
        owner: owning ? ownerOf(entries, task) : null,
        position: fold.position?.id ?? 'complete',
        steps: fold.steps.map((state) => ({ id: state.step.id, state: state.state, windowStart: state.windowStart })),
        cycles: chain.entries.filter((entry) => entry.kind === 'revise' && entry['via'] === 'gate').length,
        repeatsLeft: Object.fromEntries(def.steps.filter((step) => step.repeat > 1).map((step) => [step.id, Math.max(0, step.repeat - executions(chain.entries, step))])),
        revisesLeft: Object.fromEntries(def.steps.filter((step) => step.gate !== null && Object.keys(step.gate.onAnswer).length > 0).map((step) => [step.gate!.id, humanRevisesLeft(chain.entries, step.gate!)])),
        limits: chain.entries.filter((entry) => entry.kind === 'limit'),
        maps: chain.entries.filter((entry) => entry.kind === 'map').map((entry) => ({ id: entry.id, layers: Array.isArray(entry['layers']) ? entry['layers'] : [] })),
        orphans,
      });
    }
    return positions;
  }

  return {
    start: (input) => inside.run(true, () => start(input)),
    advance: (input) => inside.run(true, () => advance(input)),
    deliver: (task, session, scratchpadDir) => inside.run(true, () => deliver(task, session, scratchpadDir)),
    status: (task, session) => status(task, session),
    stop: (task, session, reason, detail, scratchpadDir) => inside.run(true, () => stop(task, session, reason, detail, scratchpadDir)),
  };
}
