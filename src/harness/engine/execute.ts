import path from 'node:path';
import { buildReport } from '#modules/evidence/report/report';
import { AmbicodeError } from '#util/errors';
import { exitRoute, reviseTo, serviceGate } from '../gates/answers.ts';
import { chainKey, compose, loadPayload, savePayload, stepHeader, writeStepFile } from './delivery.ts';
import { currentIn, exitOf, latestBound, executions, foldRoute, humanRevisesLeft, windowOf, matches } from './fold.ts';
import { gatePrintText, gateThen, needCommandFor, raiseGate, raisedAnswerHandler } from '../gates/gates.ts';
import { payloadKey } from './handlers.ts';
import { append, chainOf, gateFor, viewFor } from './run-context.ts';
import type { Runtime } from '#types/composition';
import type { GateDef, RouteArgs, HandlerRegistry, CommandContext, RouteRegistry, StepDef, StepMessage } from '#types/harness';
import type { Composed, Part, Run } from '../types/engine.ts';

/** Causes from a command the model ran, as opposed to a hook or a resume. */
export const EXPLICIT: ReadonlySet<string> = new Set(['route-next', 'requirements normalize', 'check', 'format', 'review', 'plan check', 'policy check --drafts', 'rules apply', 'init --apply', 'init propose', 'note save', 'note promote']);

const MAX_TURNS = 200;

type Fold = ReturnType<typeof foldRoute>;

const endsWithoutCommand = (step: StepDef): boolean => step.actor === 'model' && step.produces.length === 0 && step.answer === null;

/** A final model step with nothing after it. */
export const isClosing = (fold: Fold, step: StepDef): boolean => step.final && endsWithoutCommand(step) && fold.steps.slice(step.index + 1).every((state) => state.state === 'skipped' || state.skipsNow === true);

/** The model step delivered in the same message, when this one and the next both end without a command. */
function chainedAfter(run: Run, fold: Fold, step: StepDef): StepDef | null {
  const next = run.def.steps[step.index + 1];
  return step.chain === 'next' && next !== undefined && endsWithoutCommand(step) && endsWithoutCommand(next) && fold.steps[next.index]!.state === 'pending' ? next : null;
}

export const quiet = (value: unknown): string => String(value ?? '');

/** The header's Route line; a pending step with a condition may still be skipped. */
export function routeLine(fold: Fold, current: string): string {
  return fold.steps
    .filter((state) => state.state !== 'skipped' || state.step.id === current)
    .map(({ step, state }) => (step.id === current ? `${step.id} (now)` : state === 'done' ? `${step.id} (done)` : step.when !== null ? `${step.id} (if needed)` : step.id))
    .join(' · ');
}

export interface EngineScope { runtime: Runtime; routes: RouteRegistry; handlers: HandlerRegistry; context: CommandContext; cli: string }

/** The advance loop: fold, run what is reachable, record, and compose what the caller prints. */
export function createExecutor(scope: EngineScope): { execute(run: Run): Promise<Part>; messageOf(run: Run, part: Part): StepMessage } {
  const { routes, handlers, context, cli } = scope;
  const now = (): Date => scope.runtime.clock.now();

  const commandFor = (tail: string): string => `${cli} ${tail}`;

  const answerLine = (step: StepDef): string => `answer the user; your answer is saved as the ${step.produces.find((produced) => produced.kind === 'note')?.value ?? ''} note when you stop`;

  // e-cLRPPf: a missing check{red} was told to produce it with `route next`, the call that ends the route no-red.
  function checkCommand(run: Run, step: StepDef): string | null {
    const check = step.produces.find((produced) => produced.kind === 'check' && produced.value !== null);
    return check === undefined || step.produces.some((produced) => produced.kind === 'format') ? null : commandFor(`check --task ${run.task} <projectId>/<checkId> --only <spec> --phase ${check.value}`);
  }

  // The reviewer subagent's answer is written by `review record`; `route next` would not record it.
  const recordCommand = (run: Run, step: StepDef): string | null =>
    step.produces.some((produced) => produced.kind === 'review' && produced.value === 'recorded') ? `${commandFor(`review record --task ${run.task}`)} (reviewer JSON on standard input)` : null;

  function producerHint(run: Run, step: StepDef): string {
    if (step.answer === 'note') return answerLine(step);
    const note = step.produces.find((produced) => produced.kind === 'note');
    if (note?.value) return commandFor(`note save --task ${run.task} --kind ${note.value}`);
    return recordCommand(run, step) ?? checkCommand(run, step) ?? commandFor(`route next --task ${run.task}`);
  }

  function endingCommand(run: Run, step: StepDef): string {
    if (step.answer === 'note') return answerLine(step);
    const note = step.produces.find((produced) => produced.kind === 'note');
    if (step.actor === 'model' && note?.value) return `${commandFor(`note save --task ${run.task} --kind ${note.value}`)} (note on standard input)`;
    return recordCommand(run, step) ?? checkCommand(run, step) ?? commandFor(`route next --task ${run.task}`);
  }

  function messageOf(run: Run, part: Part): StepMessage {
    return { task: run.task, routeId: run.head.id, position: part.position, text: part.text, file: part.file, bytes: part.bytes, ledgerIds: [...run.written] };
  }

  async function partOf(run: Run, step: StepDef | null, header: string, body: string): Promise<{ part: Part; composed: Composed }> {
    const notes = run.notes.length === 0 ? '' : `${run.notes.join('\n')}\n\n`;
    const composed = compose({ header, body: `${notes}${body}`.trimEnd(), channel: run.channel, dir: run.dir, step: step?.id ?? 'complete', chain: chainKey([...chainOf(run).ids]) });
    return { part: { text: composed.text, file: composed.file, bytes: composed.bytes, position: step?.id ?? 'complete', full: composed.full }, composed };
  }


  async function finish(run: Run): Promise<Part> {
    const chain = chainOf(run);
    let status: string;
    const ended = exitOf(chain);
    if (ended !== null && ended['complete'] !== true) {
      status = `ended: ${ended['reason']}${ended['detail'] === undefined ? '' : ` (${quiet(ended['detail'])})`}`;
    } else {
      // An unverified completion still exits.
      const items = buildReport(chain.entries, { current: currentIn(run.def, chain) }).notVerified.split('\n').filter((line, index) => index > 0 && line.trim() !== 'none recorded' && line.trim() !== '' && !line.endsWith(' (historical)')).length;
      if (ended === null) await exitRoute(run, 'done', undefined, { complete: true, unverified: items });
      status = items === 0 ? 'complete' : `complete, ${items} items not verified`;
    }
    const header = `[ambicode] ${run.def.skill} · task ${run.task} · ${status}`;
    // A route that ends on a code step (init, rules) closes with that step's text.
    const last = run.def.steps.at(-1);
    const closing = last?.actor === 'code' && ended === null ? (await Promise.all(last.run.map((call) => loadPayload(run.runtime.fs, run.dir, chainKey([...chain.ids]), payloadKey(call))))).filter((text) => text !== null && text.trim() !== '').join('\n\n') : '';
    // be-vs-6140-task: after `ended: human (no-red)` the model went on editing; the end says what is left to do.
    const after = 'Make no more edits or route calls; write your final message';
    const body = status.startsWith('ended') ? `The route has ended. ${after}, saying why it ended.` : `The route is complete. ${after}.`;
    return (await partOf(run, null, header, closing !== '' ? closing : body)).part;
  }


  function openRaisedGate(run: Run, step: StepDef): GateDef | null {
    const entries = chainOf(run).entries;
    const print = entries.findLast((entry) => entry.kind === 'gate' && (entry['openAt'] ?? entry['raisedBy']) === step.id && entry['class'] !== 'declared');
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
    const header = stepHeader({ skill: run.def.skill, task: run.task, step: position, position: (declared ?? step).index + 1, total: run.def.steps.length, now: `Put this question to the user: ${gate.question}`, then: gateThen(run.task, cli), route: routeLine(foldRoute(run.def, chainOf(run)), position) });
    const { part } = await partOf(run, declared ?? step, header, text);
    if (!run.deliverOnly && !chainOf(run).entries.some((entry) => entry.kind === 'step' && entry['source'] === `print:${print.id}`)) {
      await append(run, { kind: 'step', step: gate.id, actor: 'human', status: 'delivered', cause: run.cause, channel: run.channel, source: `print:${print.id}` });
    }
    return part;
  }

  async function runCode(run: Run, step: StepDef, fold: Fold): Promise<Part | null> {
    const window = windowOf(fold, step);
    const missing = step.needs.filter((need) => !window.some((entry) => matches(entry, need)));
    if (missing.length > 0) {
      const commands = await Promise.all(missing.map(async (need) => {
        const shaped = needCommandFor(run.def.skill, need.kind);
        return shaped?.({ runtime: run.runtime, task: run.task, args: (run.head['args'] ?? {}) as RouteArgs, chain: chainOf(run).entries });
      }));
      if (commands.every((command) => command !== undefined)) {
        const lines = commands.map((command) => `\`${commandFor(command)}\``);
        const header = stepHeader({ skill: run.def.skill, task: run.task, step: step.id, position: step.index + 1, total: run.def.steps.length, now: `Run ${lines.join(', then ')}`, then: 'its output brings the next step', route: routeLine(fold, step.id) });
        return (await partOf(run, step, header, '')).part;
      }
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
    const record: Record<string, unknown> = {};
    let exit: string | undefined;
    let exitDetail: string | undefined;
    for (const call of step.run) {
      const handler = handlers.get(call.name);
      if (handler === null) throw new AmbicodeError('internal', `No handler "${call.name}" is registered.`);
      const result = await handler({ view, context, dir: run.dir, args, params: call.params, ledger: run.ledger, runtime: run.runtime, raisedBy: step.id, revise, produced: run.produced ?? [], def: run.def });
      if (result.state === 'ok') {
        // An empty file, not none: a payload left by an earlier run of this step in the chain would be delivered again.
        await savePayload(run.runtime.fs, run.dir, chainKey(view.chainIds), payloadKey(call), result.payload ?? '');
        Object.assign(record, result.record);
        if (result.exit !== undefined) exit = result.exit;
        if (result.exitDetail !== undefined) exitDetail = result.exitDetail;
        continue;
      }
      if (result.state === 'raise') {
        const elsewhere = result.raisedBy !== undefined && result.raisedBy !== step.id;
        await raiseGate(run.ledger, view, { gate: result.gate, values: result.values, raisedBy: result.raisedBy ?? step.id, ...(elsewhere ? { openAt: step.id } : {}) }, routes);
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
    await append(run, { ...record, kind: 'step', step: step.id, actor: 'code', status: 'completed', cause: run.cause, ...(exit === undefined ? {} : { exit }) });
    if (exit !== undefined) await exitRoute(run, exit, exitDetail);
    return null;
  }

  async function failure(run: Run, step: StepDef, result: { code: string; message: string; recoverable: boolean; revise?: { args: Readonly<Record<string, readonly string[]>>; lastRound?: string } }): Promise<Part | null> {
    const window = windowOf(foldRoute(run.def, chainOf(run)), step);
    const earlier = window.filter((entry) => entry.kind === 'step' && entry['step'] === step.id && entry['status'] === 'failed' && entry['code'] === result.code).length;
    const target = step.onFail === null ? undefined : run.def.steps.find((candidate) => candidate.id === step.onFail!.target);
    const last = result.revise?.lastRound !== undefined && target !== undefined && executions(chainOf(run).entries, target) + (target.id === step.id ? 2 : 1) === target.repeat;
    const args = step.onFail === null ? {} : { ...step.onFail.args, ...result.revise?.args, ...(last ? { 'Last round': [result.revise!.lastRound!] } : {}) };
    await append(run, { kind: 'step', step: step.id, actor: 'code', status: 'failed', cause: run.cause, code: result.code, message: result.message.slice(0, 300), ...(step.onFail === null ? {} : { revise: args }) });
    if (step.onFail !== null) {
      // The step ran and its result is on record; the failure is what the route wants redone (S4).
      await append(run, { kind: 'step', step: step.id, actor: 'code', status: 'completed', cause: run.cause, failed: true });
      await reviseTo(run, { target: step.onFail.target, args }, 'code', { reason: `${step.id}: ${result.code}`, raisedBy: step.id });
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
    throw new AmbicodeError(result.code, result.message, { details: error.kind === 'retry-with' ? [error.hint] : [] });
  }

  async function runModel(run: Run, step: StepDef, fold: Fold): Promise<Part | null> {
    const window = windowOf(fold, step);
    const delivered = window.some((entry) => entry.kind === 'step' && entry['step'] === step.id && entry['status'] === 'delivered');
    const chain = chainOf(run);
    let prefix = '';
    if (!run.deliverOnly && delivered && step.produces.length > 0 && step.answer === null && EXPLICIT.has(run.cause)) {
      const again = window.filter((entry) => entry.kind === 'step' && entry['step'] === step.id && entry['status'] === 'repeated').length + 1;
      const missing = step.produces.filter((produced) => !window.some((entry) => matches(entry, produced))).map((produced) => `${produced.kind}${produced.value === null ? '' : `{${produced.value}}`}`);
      if (again >= 2 && step.produces.some((produced) => produced.kind === 'check' && produced.value === 'red')) {
        await append(run, { kind: 'limit', which: 'no-red', step: step.id, count: again });
        await exitRoute(run, 'human', 'no-red');
        return finish(run);
      }
      if (again >= 3) {
        await append(run, { kind: 'limit', which: 'missing-produces', step: step.id, count: again });
        return null;
      }
      await append(run, { kind: 'step', step: step.id, actor: 'model', status: 'repeated', cause: run.cause });
      const redEnds = step.produces.some((produced) => produced.kind === 'check' && produced.value === 'red') && again === 1;
      prefix = `Not done yet: ${missing.join(', ')} is not on record. Produce it with: ${producerHint(run, step)}.${redEnds ? ` If no failing test is possible, \`${commandFor(`route next --task ${run.task}`)}\` again ends the route as no-red.` : ''}\n\n`;
    }
    const chained = chainedAfter(run, fold, step);
    const last = chained ?? step;
    const fill = (text: string): string => text.replaceAll('{cli}', cli).replaceAll('{task}', run.task);
    const instruction = fill(step.instruction!);
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
    if (chained !== null) sections.push(fill(chained.instruction!));
    const closing = isClosing(fold, last);
    const header = stepHeader({ skill: run.def.skill, task: run.task, step: step.id, position: step.index + 1, total: run.def.steps.length, now: nowLine, then: closing ? 'write your final message; no route command is needed' : endingCommand(run, step), route: routeLine(fold, step.id) });
    const { part, composed } = await partOf(run, step, header, `${prefix}${sections.join('\n\n')}`);
    if (!delivered) {
      const entry = await append(run, { kind: 'step', step: step.id, actor: 'model', status: 'delivered', cause: run.cause, channel: run.channel, bytes: part.bytes, ...(step.answer === null ? {} : { answer: step.answer }), ...(part.file === null ? {} : { file: part.file }) });
      if (chained !== null) {
        await append(run, { kind: 'step', step: step.id, actor: 'model', status: 'completed', cause: run.cause });
        await append(run, { kind: 'step', step: chained.id, actor: 'model', status: 'delivered', cause: run.cause, channel: run.channel, bytes: part.bytes, ...(chained.answer === null ? {} : { answer: chained.answer }) });
      }
      await writeStepFile(run.runtime.fs, composed, `ambicode step: ${run.def.skill}/${step.id}, task ${run.task}, ${part.bytes} bytes, ${entry.id}`);
    } else {
      await writeStepFile(run.runtime.fs, composed, `ambicode step: ${run.def.skill}/${step.id}, task ${run.task}, ${part.bytes} bytes`);
    }
    return part;
  }

  async function writeSkips(run: Run, fold: Fold): Promise<void> {
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
      if (entry.kind === 'acceptance') await raisedAnswerHandler(String(entry['gate']))?.({ view: viewFor(run, ''), ledger: run.ledger, acceptance: entry, routes });
    }
  }

  /** The worker step's gate is answered: no worker process runs any more, so a `run` answer leaves the work inline. */
  async function workerStep(run: Run, step: StepDef): Promise<void> {
    const answered = latestBound(windowOf(foldRoute(run.def, chainOf(run)), step), step.gate!.id)?.['answer'];
    const base = { kind: 'worker', worker: step.id, ms: 0, artifact: null } as const;
    if (answered === 'run') await append(run, { ...base, outcome: 'inline', reason: 'worker runs are not available' });
    else await append(run, { ...base, outcome: answered === 'inline' ? 'inline' : 'skipped' });
  }

  /** Steps 2–6 of 12 §8: fold, check, run what is reachable, record, deliver. */
  async function execute(run: Run): Promise<Part> {
    if (!run.deliverOnly) {
      await applyRaisedAnswers(run);
    }
    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      if (run.exited !== null) return finish(run);
      const fold = foldRoute(run.def, chainOf(run));
      if (!run.deliverOnly) await writeSkips(run, fold);
      const step = fold.position;
      if (step === null) return finish(run);
      const open = openRaisedGate(run, step);
      if (open !== null) {
        const outcome = await serviceGate(run, open, step.id);
        if (outcome.state === 'print') return gatePart(run, step, outcome);
        continue;
      }
      if (step.actor === 'code') {
        if (run.deliverOnly) {
          const header = stepHeader({ skill: run.def.skill, task: run.task, step: step.id, position: step.index + 1, total: run.def.steps.length, now: `Step ${step.id} has not run yet.`, then: `${cli} route next --task ${run.task}`, route: routeLine(fold, step.id) });
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
        if (latestBound(windowOf(fold, step), step.gate!.id) === null) {
          const outcome = await serviceGate(run, step.gate!, step.id);
          if (outcome.state === 'print') return gatePart(run, step, outcome);
        }
        await workerStep(run, step);
      }
    }
    throw new AmbicodeError('internal', `Route ${run.def.skill} did not settle within ${MAX_TURNS} turns.`);
  }

  return { execute, messageOf };
}
