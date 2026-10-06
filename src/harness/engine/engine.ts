import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { TASKS_DIR } from '#types/defaults';
import { loadConfigWithNotices } from '#modules/config/load';
import { indexDepsOf, startIndexBuild } from '#modules/search/code-index/codeindex';
import { Git } from '#platform/git/git';
import { raiseConflict } from '#modules/requirements/envelope/conflict';
import { hasRequirement } from '#modules/requirements/capture/has-requirement';
import { withLedgerLock } from '#modules/evidence/ledger/ledger-lock';
import { mintTaskSlug } from '#modules/evidence/task/slug';
import { excludeWorkingDirs, resolveTaskDir } from '#modules/evidence/task/task-dir';
import { AmbicodeError } from '#util/errors';
import { contentHash } from '#util/hash';
import { endRoute, markStepDelivered } from '../session/active-route.ts';
import { exitRoute, recordDefaultFlag, recordFlagAnswer, recordHookAnswer, reviseTo } from '../gates/answers.ts';
import { checkOwner, ledgerRouteContext, ledgerUnreadable } from './context.ts';
import { canonicalArgs } from '../definition/flags.ts';
import { buildChain, exitOf, foldRoute, latestRouteOf, liveHeads } from './fold.ts';
import { harnessOf } from '../session/harness.ts';
import { raiseGate } from '../gates/gates.ts';
import { createExecutor, EXPLICIT, quiet } from './execute.ts';
import { routeStatus } from './status.ts';
import { ownerOf, OWNING_SKILLS } from '../session/ownership.ts';
import { append, chainOf, latestPrint, viewFor } from './run-context.ts';
import type { Runtime } from '#types/composition';
import type { LedgerEntry, LockedLedger, TaskDir } from '#types/modules/evidence';
import type { ActiveRoutePointer, StartChannel, Exit, Answer, RouteArgs, HandlerRegistry, RouteRegistry, Engine, StepMessage, StartInput, AdvanceInput } from '#types/harness';
import type { DeliveryChannel, Part, Run } from '../types/engine.ts';

export type { Answer } from '#types/harness';

interface EngineDeps { runtime: Runtime; routes: RouteRegistry; handlers: HandlerRegistry; pointer: ActiveRoutePointer; startIndex?: typeof startIndexBuild }

const inside = new AsyncLocalStorage<true>();
/** Handlers run inside the engine; a command tail started from one would advance twice (03-T3). */
export const insideEngine = (): boolean => inside.getStore() === true;

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

  const { execute, messageOf } = createExecutor({ runtime, routes, handlers, context, cli });

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
    if (input.target !== undefined && def.skill !== 'review') {
      const field = input.target.mr !== null ? '--mr' : input.target.base !== null ? '--base' : '--branch';
      throw new AmbicodeError('bad-argument', `${field} names a review target; route ${def.skill} takes none.`, { field });
    }
    const draft = input.fromDraft !== undefined && def.steps.some((step) => step.gate?.id === 'draft-ok') ? [{ gate: 'draft-ok', option: 'implement anyway' }] : [];
    const answers = [...(input.answers ?? []), ...draft];
    validateAnswers(def, answers);
    const rt: Runtime = input.cwd === runtime.cwd ? runtime : { ...runtime, cwd: input.cwd };
    const trusted = input.channel !== 'cli';
    const headless = input.headless === true;

    const planFile = input.fromDraft ?? input.plan;
    const planTask = planFile === undefined ? undefined : /(?:^|[\\/])\.ambicode[\\/]task[\\/]([^\\/]+)[\\/][^\\/]+$/.exec(planFile)?.[1];
    const slug = input.task ?? planTask ?? (input.skill === 'init' ? `init-${now().toISOString().slice(0, 10)}` : (mintTaskSlug([...input.requirements, input.text].join(' ')) ?? `task-${contentHash(`${input.cwd}${now().toISOString()}`).slice(7, 15)}`));
    const dir = await resolveTaskDir(rt, slug);
    await excludeWorkingDirs(rt, dir.repositoryRoot);
    const config = input.skill === 'init' ? null : (await loadConfigWithNotices(rt.fs, dir.repositoryRoot)).config;
    const args = canonicalArgs({
      text: input.text,
      requirements: input.requirements,
      project: input.project ?? null,
      plan: planFile ?? null,
      fromDraft: input.fromDraft ?? null,
      answers,
      headless,
      ...(input.target === undefined ? {} : { target: input.target }),
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
      if (input.produced !== undefined) run.produced = input.produced;
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

  // ---------------------------------------------------------------- stop

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

  return {
    start: (input) => inside.run(true, () => start(input)),
    advance: (input) => inside.run(true, () => advance(input)),
    deliver: (task, session, scratchpadDir) => inside.run(true, () => deliver(task, session, scratchpadDir)),
    status: (task, session) => routeStatus({ runtime, routes }, task, session),
    stop: (task, session, reason, detail, scratchpadDir) => inside.run(true, () => stop(task, session, reason, detail, scratchpadDir)),
  };
}
