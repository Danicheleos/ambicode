import { AsyncLocalStorage } from 'node:async_hooks';
import { loadConfig } from '#modules/config/load';
import { hasRequirement, requirementsServer } from '#modules/requirements/capture/has-requirement';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { saveNote } from '#modules/evidence/notes';
import { TASK_PATH, iterationOf } from '#modules/evidence/task/slug';
import { resolveTaskDir, taskDirFor, taskNameFor } from '#modules/evidence/task/task-dir';
import { dirKindFor } from '#types/defaults';
import { openRepository } from '#platform/git/open';
import { mrUrlIn, parseMrUrl } from '#platform/gitlab/glab';
import { standaloneReviewName } from '#modules/review/bundle/review-name';
import { AmbicodeError, isAmbicodeError } from '#util/errors';
import { markHeadless, markStepDelivered, sessionRoutes } from '../session/active-route.ts';
import { matchOption } from '../gates/gates.ts';
import { exitRoute, recordFlagAnswer, recordHookAnswer, unknownGate } from '../gates/answers.ts';
import { commandContext, entriesOf, readEntries, routeNotOpen } from './context.ts';
import { canonicalArgs, parseAnswerFlag } from '../definition/flags.ts';
import { buildChain, exitOf, foldRoute, liveHeads, producesOf, windowOf } from './fold.ts';
import { taskForEmptyStart } from './empty-start.ts';
import { stopHook } from './stop.ts';
import { EXPLICIT, createExecutor, isClosing } from './execute.ts';
import { append, chainOf, closeRoute, latestPrint } from './run-context.ts';
import type { Runtime } from '#types/composition';
import type { LedgerEntry, LockedLedger, TaskDir } from '#types/modules/evidence';
import type { ReviewTargetArgs, AdvanceInput, Answer, CommandName, RouteArgs, CommandScope, Engine, Exit, GuardedCommand, HandlerRegistry, RouteRegistry, StartInput, StepMessage } from '#types/harness';
import type { DeliveryChannel, Part, Run } from '../types/engine.ts';

export type { Answer } from '#types/harness';

interface EngineDeps { runtime: Runtime; routes: RouteRegistry; handlers: HandlerRegistry }

const inside = new AsyncLocalStorage<true>();
/** Handlers run inside the engine; a command tail started from one would advance twice (03-T3). */
export const insideEngine = (): boolean => inside.getStore() === true;

async function reviewRunName(rt: Runtime, target: ReviewTargetArgs | undefined, now: Date): Promise<string> {
  const branching = target?.branch === true;
  const branch = branching ? await openRepository(rt).then(({ git }) => git.currentBranch(), () => null) : null;
  return standaloneReviewName({ mr: target?.mr ?? null, iid: target?.mr == null ? null : parseMrUrl(target.mr).iid, branch, branching, now });
}

export function createEngine(deps: EngineDeps): Engine {
  const { runtime, routes, handlers } = deps;
  const context = commandContext({ runtime, routes });
  const now = (): Date => runtime.clock.now();
  const cli = `node "${runtime.pluginRoot}/scripts/ambicode.mjs"`;

  function newRun(input: { runtime: Runtime; def: Run['def']; task: string; dir: TaskDir; ledger: LockedLedger; entries: LedgerEntry[]; head: LedgerEntry; session: string; cause: string; channel: DeliveryChannel; scratchpadDir?: string; deliverOnly?: boolean }): Run {
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
      cause: input.cause,
      channel: input.channel,
      scratchpadDir: input.scratchpadDir,
      deliverOnly: input.deliverOnly ?? false,
      written,
      notes: [],
      exited: null,
      restart: false,
    };
  }

  const { execute, messageOf } = createExecutor({ runtime, routes, handlers, context, cli });

  /** A hook-launched route remembers its Claude scratchpad, so a CLI call without one uses the same state files. */
  function scratchOf(head: LedgerEntry, given: string | undefined): { scratchpadDir?: string } {
    const dir = given ?? (typeof head['scratchpad'] === 'string' ? head['scratchpad'] : undefined);
    return dir === undefined ? {} : { scratchpadDir: dir };
  }

  async function settle(run: Run, part: Part): Promise<void> {
    const live = part.position !== 'complete' && run.exited === null && exitOf(chainOf(run)) === null;
    await markHeadless(run.runtime.fs, { session: run.session, scratchpad: run.scratchpadDir, on: live && run.head['mode'] === 'headless' });
    if (live) await markStepDelivered(run.runtime.fs, { session: run.session, scratchpad: run.scratchpadDir, routeId: run.head.id, position: part.position });
  }

  /** One live route per task: whatever stands is ended before another begins, whichever session started it. */
  async function interrupt(dir: TaskDir, ledger: LockedLedger, entries: readonly LedgerEntry[]): Promise<void> {
    for (const head of liveHeads(entries)) await closeRoute(runtime, routes, dir, ledger, { route: head.id, reason: 'interrupted', detail: 'a new route started' });
  }

  /** The same launch again on the same task: it names no iteration, so the new route picks the next one itself. */
  function restartOf(run: Run): StartInput {
    const args = run.head['args'] as RouteArgs;
    return {
      skill: run.def.skill,
      task: run.task,
      text: args.text,
      requirements: args.requirements,
      headless: args.headless,
      answers: args.answers.map(parseAnswerFlag),
      cwd: run.runtime.cwd,
      session: run.session,
      channel: run.head['channel'] as StartInput['channel'],
      ...(args.project === null ? {} : { project: args.project }),
      ...(args.plan === null ? {} : { plan: args.plan }),
      ...(args.target === undefined ? {} : { target: args.target }),
      ...scratchOf(run.head, undefined),
    };
  }

  // ---------------------------------------------------------------- start

  function validateAnswers(def: Run['def'], answers: readonly Answer[]): void {
    for (const answer of answers) {
      const declared = def.steps.find((step) => step.gate?.id === answer.gate)?.gate;
      const gate = declared ?? routes.gate(answer.gate);
      if (gate === null || gate === undefined) {
        throw unknownGate(def, routes, answer.gate);
      }
      if (gate.class !== 'decision' && !gate.free && matchOption(gate.options, answer.option) === null && !gate.options.some((option) => /\{.*\}/.test(option))) {
        throw new AmbicodeError('gate-option-unknown', `Gate ${gate.id} has no option "${answer.option}".`, { details: [`Options: ${gate.options.join(', ')}.`] });
      }
    }
  }

  async function start(input: StartInput): Promise<StepMessage> {
    const def = routes.route(input.skill);
    if (def === null) {
      throw new AmbicodeError('route-unknown', `No route ships for "${input.skill}".`, { details: [`Shipped routes: ${routes.skills().join(', ') || 'none'}.`] });
    }
    if (input.target !== undefined && def.skill !== 'review') {
      const field = input.target.mr !== null ? '--mr' : input.target.base !== null ? '--base' : '--branch';
      throw new AmbicodeError('bad-argument', `${field} names a review target; route ${def.skill} takes none.`, { field });
    }
    const answers = input.answers ?? [];
    validateAnswers(def, answers);
    const rt: Runtime = input.cwd === runtime.cwd ? runtime : { ...runtime, cwd: input.cwd };
    const trusted = input.channel !== 'cli';
    const headless = input.headless === true;

    // A merge-request URL as the text is the target, not a requirement to fetch.
    const textMr = def.skill === 'review' && input.target === undefined ? mrUrlIn(input.text) : null;
    const target = textMr === null ? input.target : { branch: false, base: null, mr: textMr };
    const request = input.requirements[0] ?? (input.text.trim() === '' ? input.plan ?? '' : input.text);
    let slug = input.task ?? (input.plan === undefined ? undefined : TASK_PATH.exec(input.plan)?.[1]) ?? (def.skill === 'review' ? await reviewRunName(rt, target, now()) : await taskNameFor(rt, 'task', request));
    let text = textMr === null ? input.text : '';
    if (slug === null && def.needsRequest === true) {
      slug = await taskForEmptyStart(rt, routes, input.skill, input.session);
      text = slug;
    }
    slug ??= input.skill;
    const dir = await resolveTaskDir(rt, slug, dirKindFor(input.skill));
    const config = (await loadConfig(rt.fs, dir.repositoryRoot)).config;
    const inputArgs = canonicalArgs({
      text,
      iteration: iterationOf(text, slug),
      requirements: input.requirements,
      project: input.project ?? null,
      plan: input.plan ?? null,
      answers,
      headless,
      ...(target === undefined ? {} : { target }),
      hasRequirement: hasRequirement({ text, requirements: input.requirements, headless }, { mcpServer: requirementsServer(config.requirements.mcps) }),
    });
    const delivery: DeliveryChannel = input.channel === 'hook' ? 'hook' : 'cli';

    const result = await withLedgerLock(rt.fs, dir.root, now, input.session, async (ledger): Promise<{ message: StepMessage; run: Run; part: Part }> => {
      const entries = entriesOf(slug, await ledger.read());
      await interrupt(dir, ledger, entries);

      const head = await ledger.append({
        kind: 'route',
        skill: def.skill,
        args: inputArgs,
        mode: headless ? 'headless' : 'interactive',
        channel: input.channel,
        trusted,
        session: input.session,
        ...(input.scratchpadDir === undefined ? {} : { scratchpad: input.scratchpadDir }),
        epoch: 1,
      });
      entries.push(head);
      const active = newRun({ runtime: rt, def, task: slug, dir, ledger, entries, head, session: input.session, cause: 'start', channel: delivery, ...(input.scratchpadDir === undefined ? {} : { scratchpadDir: input.scratchpadDir }) });
      active.written.push(head.id);
      if (headless) active.notes.push(trusted ? 'Mode: headless (set by the user).' : 'Mode: headless (set by the model); the report lists it under Not verified.');
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
    }, { creates: true });
    await settle(result.run, result.part);
    for (const other of (await sessionRoutes(rt.fs, dir.repositoryRoot, input.session)).filter((route) => route.live && route.task !== slug)) {
      const otherDir = taskDirFor(dir.repositoryRoot, other.task, '.', dirKindFor(other.skill));
      await withLedgerLock(rt.fs, otherDir.root, now, input.session, async (ledger) => {
        const read = await ledger.read();
        if (read.state === 'ok') await interrupt(otherDir, ledger, read.entries);
      });
    }
    return result.run.restart ? start(restartOf(result.run)) : result.message;
  }

  // ---------------------------------------------------------------- advance

  async function advance(input: AdvanceInput): Promise<StepMessage> {
    const dir = await resolveTaskDir(runtime, input.task);
    const result = await withLedgerLock(runtime.fs, dir.root, now, runtime.ids.writerId(), async (ledger) => {
      const entries = entriesOf(input.task, await ledger.read());
      const head = liveHeads(entries).at(-1);
      const def = head === undefined ? null : routes.route(String(head['skill']));
      if (head === undefined || def === null) throw routeNotOpen(input.task);
      const chain = buildChain(entries, head);
      const run = newRun({ runtime, def, task: input.task, dir, ledger, entries, head, session: String(head['session']), cause: input.cause, channel: input.cause === 'gate-hook' ? 'hook' : 'cli', ...scratchOf(head, input.scratchpadDir) });
      if (input.produced !== undefined) run.produced = input.produced;
      const fold = foldRoute(def, chain);
      const position = fold.position;
      // A held record moves the fold past a delegated step before `route next`: the step after it was never delivered, so it is not finished.
      if (position?.actor === 'model' && producesOf(position, chain.entries).length === 0 && EXPLICIT.has(input.cause) && windowOf(fold, position).some((entry) => entry.kind === 'step' && entry['step'] === position.id && entry['status'] === 'delivered')) {
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
      const part = await execute(run);
      return { run, message: messageOf(run, part), part };
    });
    await settle(result.run, result.part);
    return result.run.restart ? start(restartOf(result.run)) : result.message;
  }

  async function deliver(task: string, scratchpadDir?: string): Promise<StepMessage | null> {
    const dir = await resolveTaskDir(runtime, task);
    return withLedgerLock(runtime.fs, dir.root, now, runtime.ids.writerId(), async (ledger) => {
      const entries = entriesOf(task, await ledger.read());
      const head = liveHeads(entries).at(-1);
      const def = head === undefined ? null : routes.route(String(head['skill']));
      if (head === undefined || def === null) return null;
      const run = newRun({ runtime, def, task, dir, ledger, entries, head, session: String(head['session']), cause: 'resume', channel: 'hook', ...scratchOf(head, scratchpadDir), deliverOnly: true });
      return messageOf(run, await execute(run));
    });
  }

  async function stop(task: string, reason: Exit, detail: string | undefined, scratchpadDir?: string): Promise<void> {
    const dir = await resolveTaskDir(runtime, task);
    const head = await withLedgerLock(runtime.fs, dir.root, now, runtime.ids.writerId(), async (ledger) => {
      const route = liveHeads(entriesOf(task, await ledger.read())).at(-1);
      if (route === undefined) throw routeNotOpen(task);
      await closeRoute(runtime, routes, dir, ledger, { route: route.id, reason, ...(detail === undefined ? {} : { detail }) });
      return route;
    });
    await markHeadless(runtime.fs, { session: String(head['session']), scratchpad: scratchpadDir, on: false });
  }

  async function closeFinal(task: string, routeId: string, scratchpadDir?: string): Promise<boolean> {
    const dir = await resolveTaskDir(runtime, task);
    return withLedgerLock(runtime.fs, dir.root, now, routeId, async (ledger) => {
      const entries = entriesOf(task, await ledger.read());
      const head = liveHeads(entries).find((entry) => entry.id === routeId);
      const def = head === undefined ? null : routes.route(String(head['skill']));
      if (head === undefined || def === null) return false;
      const fold = foldRoute(def, buildChain(entries, head));
      const step = fold.position;
      const closing = step !== null && isClosing(fold, step) && windowOf(fold, step).some((entry) => entry.kind === 'step' && entry['step'] === step.id && entry['status'] === 'delivered');
      const headless = head['mode'] === 'headless' && head['trusted'] === true;
      if (!closing && !headless) return false;
      const session = String(head['session']);
      const run = newRun({ runtime, def, task, dir, ledger, entries, head, session, cause: 'stop', channel: 'hook', ...scratchOf(head, scratchpadDir), deliverOnly: true });
      if (closing) {
        await append(run, { kind: 'step', step: step.id, actor: 'model', status: 'completed', cause: 'stop' });
        await execute(run);
      } else {
        await exitRoute(run, 'inconclusive', `the headless session stopped at step ${step?.id ?? 'none'}`);
      }
      await markHeadless(runtime.fs, { session, scratchpad: run.scratchpadDir, on: false });
      return true;
    });
  }

  /** What `note save --kind investigation` then its command tail do, for a final message the Stop hook was handed. */
  async function answerNote(task: string, session: string, routeId: string, body: string, scratchpadDir?: string): Promise<StepMessage> {
    await saveNote({ runtime, session, context }, { task, kind: 'investigation', body, from: null, route: routeId });
    return advance({ task, cause: 'note save', ...(scratchpadDir === undefined ? {} : { scratchpadDir }) });
  }

  const stopPorts = { runtime, routes, closeFinal, answerNote };

  return {
    start: (input) => inside.run(true, () => start(input)),
    advance: (input) => inside.run(true, () => advance(input)),
    deliver: (task, scratchpadDir) => inside.run(true, () => deliver(task, scratchpadDir)),
    stopHook: (input, found) => inside.run(true, () => stopHook(stopPorts, input, found)),
    stop: (task, reason, detail, scratchpadDir) => inside.run(true, () => stop(task, reason, detail, scratchpadDir)),
    command: (spec, request, body) => runCommand({ runtime, routes }, spec, request, body),
  };
}

/** Resolves whom a guarded command speaks for and hands its body the route context; the body does the module's work. */
async function runCommand<T>(
  deps: { runtime: Runtime; routes: RouteRegistry },
  spec: GuardedCommand,
  request: { task: string },
  body: (scope: CommandScope) => Promise<T>,
): Promise<T> {
  const { runtime } = deps;
  const context = commandContext(deps);
  const head = liveHeads(await readEntries(runtime, request.task)).at(-1);
  if (spec.route === 'owned' && head === undefined) throw routeNotOpen(request.task);
  const session = head === undefined ? null : String(head['session']);
  const view = session === null ? null : await context.open(request.task, session);
  return body({ task: request.task, session, view, context });
}

/**
 * Called once by each evidence-writing wrapper after its own ledger write. No live route means the write stands and
 * nothing advances (03-T1). A handler inside the engine never reaches here (03-T3).
 */
export async function runCommandTail(
  deps: { engine: Engine },
  input: { task: string; cause: CommandName; scratchpadDir?: string; produced?: readonly string[] },
): Promise<StepMessage | null> {
  if (insideEngine()) throw new Error(`The ${input.cause} tail ran inside the route engine; a handler must not call a command tail.`);
  try {
    return await deps.engine.advance({ task: input.task, cause: input.cause, ...(input.produced === undefined ? {} : { produced: input.produced }), ...(input.scratchpadDir === undefined ? {} : { scratchpadDir: input.scratchpadDir }) });
  } catch (error) {
    if (isAmbicodeError(error) && (error.code === 'route-not-open' || error.code === 'task-unknown')) return null;
    throw error;
  }
}
