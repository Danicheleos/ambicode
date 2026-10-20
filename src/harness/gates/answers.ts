import { AmbicodeError } from '#util/errors';
import { executions, foldRoute, humanRevisesLeft, printsOf, unconsumedPreanswer, windowOf } from '../engine/fold.ts';
import { bareOption, matchOption, shapePrint } from './gates.ts';
import { append, chainOf, closeRoute, gateFor, latestPrint, objectOf } from '../engine/run-context.ts';
import type { ArtifactRef, LedgerEntry } from '#types/modules/evidence';
import { RAISED_BY, type Answer, type Exit, type GateDef, type Revise, type RouteDef, type RouteRegistry } from '#types/harness';
import type { Run } from '../types/engine.ts';

type RevisePath = 'gate' | 'code' | 'model';

export async function exitRoute(run: Run, reason: Exit | string, detail?: string, extra: object = {}): Promise<void> {
  await closeRoute(run.runtime, run.routes, run.dir, run.ledger, { route: run.head.id, reason, ...(detail === undefined ? {} : { detail }), ...extra });
  run.exited = reason;
}

/** An option named `stop` records an exit: a project question `human`, the rest `blocked` (D12). */
const stopReason = (gate: string): string => (gate === 'project-ambiguous' || gate === 'scope' ? 'human' : 'blocked');

/** The window a gate's answers are read in: its own step's, or for a raised gate the step that raised it. */
function gateWindow(run: Run, gateId: string): LedgerEntry[] {
  const chain = chainOf(run);
  const fold = foldRoute(run.def, chain);
  const declared = run.def.steps.find((step) => step.gate?.id === gateId);
  const raisedBy = declared === undefined ? run.def.steps.find((step) => step.id === latestPrint(chain.entries, gateId)?.['raisedBy']) : declared;
  return raisedBy === undefined ? chain.entries : windowOf(fold, raisedBy);
}

/** A revise, refused by the target's `repeat` when it is automatic (03-F6). Returns whether it was written. */
export async function reviseTo(
  run: Run,
  revise: Revise,
  via: RevisePath,
  info: { reason: string; gate?: string; raisedBy?: string; answer?: string; repeat?: number },
): Promise<boolean> {
  const exempt = revise.target === RAISED_BY;
  const target = exempt ? info.raisedBy : revise.target;
  const step = run.def.steps.find((candidate) => candidate.id === target);
  if (step === undefined) throw new AmbicodeError('internal', `Revise target "${revise.target}" is not a step of route ${run.def.skill}.`);
  const chain = chainOf(run);
  const mark = info.gate === undefined ? {} : { gate: info.gate };
  if (via !== 'gate' && !exempt && step.actor !== 'human') {
    const done = executions(chain.entries, step);
    if (done + 1 > step.repeat) {
      await append(run, { kind: 'limit', which: 'repeat', step: step.id, count: done, ...mark });
      return false;
    }
  }
  if (exempt && info.repeat !== undefined) {
    const done = chain.entries.filter((entry) => entry.kind === 'revise' && entry['from'] === step.id && entry['gate'] === info.gate).length;
    if (done >= info.repeat) {
      await append(run, { kind: 'limit', which: 'max-revises', step: step.id, count: done, ...mark });
      return false;
    }
  }
  const args = Object.fromEntries(Object.entries(revise.args).map(([name, values]) => [name, values.map((value) => (value === '$answer' ? (info.answer ?? '') : value))]));
  const humanCycles = chain.entries.filter((entry) => entry.kind === 'revise' && entry['via'] === 'gate').length;
  await append(run, {
    kind: 'revise',
    from: step.id,
    via,
    cycle: humanCycles + (via === 'gate' ? 1 : 0),
    reason: info.reason,
    ...(Object.keys(args).length === 0 ? {} : { args }),
    ...mark,
  });
  return true;
}

interface Recorded {
  kind: 'acceptance' | 'default-taken';
  answer: string;
  via: string;
  instance: string | null;
  object: ArtifactRef | null;
  revisePath: RevisePath;
  extra?: object;
}

/** Writes a bound answer, then applies the gate's `onAnswer` (03-G5, 03-F7). */
async function recordAnswer(run: Run, gate: GateDef, recorded: Recorded, raisedBy?: string): Promise<void> {
  const free = !gate.options.includes(recorded.answer);
  const revise = recorded.kind === 'default-taken' ? undefined : (gate.onAnswer[recorded.answer] ?? (free ? gate.onAnswer['*'] : undefined));
  const entries = chainOf(run).entries;
  const body = { gate: gate.id, instance: recorded.instance, answer: recorded.answer, via: recorded.via, ...(recorded.object === null ? {} : { object: recorded.object }), ...recorded.extra };
  if (recorded.kind === 'acceptance' && revise !== undefined && recorded.revisePath === 'gate' && humanRevisesLeft(entries, gate) === 0) {
    await append(run, { kind: 'declined', ...body, reason: 'max-revises' });
    return;
  }
  await append(run, { kind: recorded.kind, ...body });
  if (recorded.answer === 'stop' || recorded.answer === 'pause') return exitRoute(run, stopReason(gate.id), `${gate.id}: stop`);
  if (revise !== undefined) {
    await reviseTo(run, revise, recorded.revisePath, { reason: `${gate.id}: ${recorded.answer}`, gate: gate.id, answer: recorded.answer, repeat: gate.repeat, ...(raisedBy === undefined ? {} : { raisedBy }) });
  }
}

export const unknownGate = (def: RouteDef, routes: RouteRegistry, gate: string): AmbicodeError =>
  new AmbicodeError('gate-unknown', `Route ${def.skill} has no gate "${gate}".`, {
    details: [`Gates of this route: ${def.steps.filter((step) => step.gate !== null).map((step) => step.id).join(', ') || 'none'}.`, `Registry gates: ${routes.gates().map((gate) => gate.id).join(', ')}.`],
  });

/** `route next --answer <gate>=<option>`: a model-typed answer. It selects a non-acting option and never authorizes (03-G1). */
export async function recordFlagAnswer(run: Run, given: Answer): Promise<void> {
  const window = gateWindow(run, given.gate);
  const print = latestPrint(window, given.gate);
  const gate = gateFor(run, given.gate, print);
  if (gate === null) throw unknownGate(run.def, run.routes, given.gate);
  const options = (print?.['options'] as string[] | undefined) ?? gate.options;
  const offered = matchOption(options, given.option);
  const answer = { ...given, option: offered ?? matchOption(gate.options, given.option) ?? bareOption(given.option) };
  const known = offered !== null;
  if (!known && !gate.free && gate.class !== 'decision') {
    throw new AmbicodeError('gate-option-unknown', `Gate ${gate.id} has no option "${answer.option}".`, { details: [`Options: ${options.join(', ')}.`] });
  }
  const instance = print?.id ?? null;
  if ((known || gate.options.includes(answer.option)) && gate.acting.includes(answer.option)) {
    await append(run, { kind: 'declined', gate: gate.id, instance, answer: answer.option, via: 'flag', reason: 'acting-needs-human' });
    return;
  }
  if (!known && gate.options.includes(answer.option)) {
    await append(run, { kind: 'declined', gate: gate.id, instance, answer: answer.option, via: 'flag', reason: 'option-not-offered' });
    return;
  }
  await recordAnswer(run, gate, { kind: 'acceptance', answer: answer.option, via: 'flag', instance, object: (print?.['object'] as ArtifactRef | undefined) ?? null, revisePath: 'model' }, print?.['raisedBy'] as string | undefined);
}

/** A hook answer binds to the exact printed instance in this chain or it is unbound and changes nothing (03-G4, 03-G6). */
export async function recordHookAnswer(run: Run, given: Answer & { question?: string }): Promise<void> {
  const unbound = (reason: string): Promise<LedgerEntry> =>
    append(run, { kind: 'declined', gate: given.gate, instance: null, answer: given.option, via: 'hook', unbound: true, reason });
  const chain = chainOf(run).entries;
  let print: LedgerEntry | undefined;
  if (given.instance === undefined) {
    if (!given.gate.startsWith('decision:')) return void (await unbound('no-instance'));
    const decision = gateFor(run, given.gate);
    if (decision === null) return void (await unbound('unknown-gate'));
    print = await append(run, { kind: 'gate', gate: given.gate, class: 'decision', question: given.question ?? given.gate, print: 1, options: [bareOption(given.option)] });
    return recordAnswer(run, decision, { kind: 'acceptance', answer: bareOption(given.option), via: 'hook', instance: print.id, object: null, revisePath: 'gate' });
  }
  print = chain.find((entry) => entry.kind === 'gate' && entry.id === given.instance);
  if (print === undefined) return void (await unbound('unknown-instance'));
  if (print['gate'] !== given.gate) return void (await unbound('wrong-gate'));
  const gate = gateFor(run, given.gate, print);
  if (gate === null) return void (await unbound('unknown-gate'));
  const options = (print['options'] as string[] | undefined) ?? gate.options;
  const offered = matchOption(options, given.option);
  const declared = matchOption(gate.options, given.option);
  const answer = { ...given, option: offered ?? declared ?? bareOption(given.option) };
  if (offered === null && gate.class !== 'decision' && (!gate.free || declared !== null)) {
    await append(run, { kind: 'declined', gate: gate.id, instance: print.id, answer: answer.option, via: 'hook', reason: 'option-not-offered' });
    return;
  }
  await recordAnswer(run, gate, { kind: 'acceptance', answer: answer.option, via: 'hook', instance: print.id, object: (print['object'] as ArtifactRef | undefined) ?? null, revisePath: 'gate' }, print['raisedBy'] as string | undefined);
}

type GateOutcome = { state: 'continue' } | { state: 'print'; print: LedgerEntry; gate: GateDef };

/**
 * A gate at the position: convert a preanswer, take the headless default, or print it (03-G3). A print already in the
 * window is delivered again; `deliverOnly` writes nothing new.
 */
export async function serviceGate(run: Run, gate: GateDef, stepId: string): Promise<GateOutcome> {
  const step = run.def.steps.find((candidate) => candidate.id === stepId)!;
  const window = (): LedgerEntry[] => windowOf(foldRoute(run.def, chainOf(run)), step);
  const declaredStep = run.def.steps.find((candidate) => candidate.gate?.id === gate.id);
  const raisedPrint = declaredStep === undefined ? latestPrint(window(), gate.id) : null;
  const raisedBy = declaredStep === undefined ? String(raisedPrint?.['raisedBy'] ?? stepId) : undefined;
  const newPrint = async (): Promise<LedgerEntry> => {
    // A gate raised by this very run was just printed by the raise: that print is the one delivered.
    const raised = declaredStep === undefined ? latestPrint(window(), gate.id) : null;
    if (raised !== null && run.written.includes(raised.id) && (raised['openAt'] ?? raised['raisedBy']) === stepId) return raised;
    const prints = printsOf(chainOf(run).entries, gate.id).length;
    const source = latestPrint(window(), gate.id);
    const object = declaredStep === undefined ? null : objectOf(run, declaredStep);
    const shaped = await shapePrint(gate, { runtime: run.runtime, dir: run.dir, task: run.task, chain: chainOf(run).entries });
    return append(run, {
      kind: 'gate',
      gate: gate.id,
      class: declaredStep === undefined ? (gate.class === 'decision' ? 'decision' : 'raised') : 'declared',
      question: shaped.question,
      print: prints + 1,
      cause: run.cause,
      options: shaped.options,
      ...(shaped.values === undefined ? {} : { values: shaped.values }),
      ...(declaredStep === undefined ? { raisedBy, ...(source?.['openAt'] === undefined ? {} : { openAt: source['openAt'] }), ...(source?.['values'] === undefined ? {} : { values: source['values'] }) } : {}),
      ...(object === null ? {} : { object }),
    });
  };

  const preanswer = run.deliverOnly ? null : unconsumedPreanswer(chainOf(run).entries, gate.id);
  if (preanswer !== null) {
    const print = await newPrint();
    const given = String(preanswer['option']);
    const option = matchOption((print['options'] as string[] | undefined) ?? gate.options, given) ?? (gate.free && matchOption(gate.options, given) === null ? bareOption(given) : null);
    if (option === null) {
      await append(run, { kind: 'declined', gate: gate.id, instance: print.id, answer: String(preanswer['option']), via: 'prompt', reason: 'option-not-offered', preanswer: preanswer.id });
    } else {
      const trusted = preanswer['trusted'] === true;
      await recordAnswer(run, gate, { kind: 'acceptance', answer: option, via: 'prompt', instance: print.id, object: (print['object'] as ArtifactRef | undefined) ?? null, revisePath: trusted ? 'gate' : 'model', extra: { preanswer: preanswer.id, trusted } }, raisedBy);
      return { state: 'continue' };
    }
  }

  const prints = printsOf(window(), gate.id);
  if (!run.deliverOnly && run.head['mode'] === 'headless') {
    const print = prints.at(-1) ?? (await newPrint());
    await recordAnswer(run, gate, { kind: 'default-taken', answer: gate.default, via: 'headless', instance: print.id, object: (print['object'] as ArtifactRef | undefined) ?? null, revisePath: 'code' }, raisedBy);
    return { state: 'continue' };
  }
  // One rule for an unanswered gate: a printed question holds the route and is shown again as it was, never counted toward a default.
  return { state: 'print', print: prints.at(-1) ?? (await newPrint()), gate };
}
