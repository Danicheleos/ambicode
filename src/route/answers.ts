import type { ArtifactRef } from '../task/kinds.ts';
import type { LedgerEntry } from '../task/ledger.ts';
import { AmbicodeError } from '../util/errors.ts';
import type { Answer } from './flags.ts';
import { askedCount, executions, foldRoute, humanRevisesLeft, printsOf, unconsumedPreanswer, windowOf } from './fold.ts';
import { RAISED_BY, type Exit, type GateDef, type Revise } from './dsl.ts';
import { raisedAnswerHandler, offersOption } from './gates.ts';
import { append, chainOf, gateFor, latestPrint, objectOf, viewFor, type Run } from './run-context.ts';

type Entry = LedgerEntry;
type RevisePath = 'gate' | 'code' | 'model';

export async function exitRoute(run: Run, reason: Exit, detail?: string, extra: object = {}): Promise<void> {
  await append(run, { kind: 'exit', reason, ...(detail === undefined ? {} : { detail }), ...extra });
  run.exited = reason;
}

/** An option named `stop` records an exit: the budget gate exits `budget`, a project question `human`, the rest `blocked` (D12). */
const stopReason = (gate: string): Exit => (gate === 'budget-exhausted' ? 'budget' : gate === 'project-ambiguous' || gate === 'scope' ? 'human' : 'blocked');

/** The window a gate's answers are read in: its own step's, or for a raised gate the step that raised it. */
export function gateWindow(run: Run, gateId: string): Entry[] {
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
  info: { reason: string; gate?: string; raisedBy?: string; answer?: string },
): Promise<boolean> {
  const exempt = revise.target === RAISED_BY;
  const target = exempt ? info.raisedBy : revise.target;
  const step = run.def.steps.find((candidate) => candidate.id === target);
  if (step === undefined) throw new AmbicodeError('internal', `Revise target "${revise.target}" is not a step of route ${run.def.skill}.`);
  const chain = chainOf(run);
  if (via !== 'gate' && !exempt && step.actor !== 'human') {
    const done = executions(chain.entries, step);
    if (done + 1 > step.repeat) {
      await append(run, { kind: 'limit', which: 'repeat', step: step.id, count: done });
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
    ...(info.gate === undefined ? {} : { gate: info.gate }),
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
export async function recordAnswer(run: Run, gate: GateDef, recorded: Recorded, raisedBy?: string): Promise<void> {
  const free = !gate.options.includes(recorded.answer);
  const revise = gate.onAnswer[recorded.answer] ?? (free ? gate.onAnswer['*'] : undefined);
  const entries = chainOf(run).entries;
  const body = { gate: gate.id, instance: recorded.instance, answer: recorded.answer, via: recorded.via, ...(recorded.object === null ? {} : { object: recorded.object }), ...recorded.extra };
  if (recorded.kind === 'acceptance' && revise !== undefined && recorded.revisePath === 'gate' && humanRevisesLeft(entries, gate) === 0) {
    await append(run, { kind: 'declined', ...body, reason: 'max-revises' });
    return;
  }
  const written = await append(run, { kind: recorded.kind, ...body });
  if (recorded.kind === 'acceptance') await raisedAnswerHandler(gate.id)?.({ view: viewFor(run, raisedBy ?? ''), ledger: run.ledger, acceptance: written });
  if (recorded.answer === 'stop' || recorded.answer === 'pause') return exitRoute(run, stopReason(gate.id), `${gate.id}: stop`);
  if (revise !== undefined) {
    await reviseTo(run, revise, recorded.revisePath, { reason: `${gate.id}: ${recorded.answer}`, gate: gate.id, answer: recorded.answer, ...(raisedBy === undefined ? {} : { raisedBy }) });
  }
}

const unknownGate = (run: Run, gate: string): AmbicodeError =>
  new AmbicodeError('gate-unknown', `Route ${run.def.skill} has no gate "${gate}".`, {
    details: [`Gates of this route: ${run.def.steps.filter((step) => step.gate !== null).map((step) => step.id).join(', ') || 'none'}.`, `Registry gates: ${run.routes.gates().map((gate) => gate.id).join(', ')}.`],
  });

/** `route next --answer <gate>=<option>`: a model-typed answer. It selects a non-acting option and never authorizes (03-G1). */
export async function recordFlagAnswer(run: Run, answer: Answer): Promise<void> {
  const window = gateWindow(run, answer.gate);
  const print = latestPrint(window, answer.gate);
  const gate = gateFor(run, answer.gate, print);
  if (gate === null) throw unknownGate(run, answer.gate);
  const options = (print?.['options'] as string[] | undefined) ?? gate.options;
  const known = offersOption(gate.id, options, answer.option);
  if (!known && gate.onAnswer['*'] === undefined && gate.class !== 'decision') {
    throw new AmbicodeError('gate-option-unknown', `Gate ${gate.id} has no option "${answer.option}".`, { details: [`Options: ${options.join(', ')}.`] });
  }
  const instance = print?.id ?? null;
  if (known && gate.acting.includes(answer.option)) {
    await append(run, { kind: 'declined', gate: gate.id, instance, answer: answer.option, via: 'flag', reason: 'acting-needs-human' });
    return;
  }
  await recordAnswer(run, gate, { kind: 'acceptance', answer: answer.option, via: 'flag', instance, object: (print?.['object'] as ArtifactRef | undefined) ?? null, revisePath: 'model' }, print?.['raisedBy'] as string | undefined);
}

export async function recordDefaultFlag(run: Run, gateId: string): Promise<void> {
  const window = gateWindow(run, gateId);
  const print = latestPrint(window, gateId);
  const gate = gateFor(run, gateId, print);
  if (gate === null) throw unknownGate(run, gateId);
  if (run.head['mode'] !== 'headless' && askedCount(window, gateId) < 1) {
    throw new AmbicodeError('default-not-allowed', `--default ${gateId} is allowed only after the question was put to the user.`, {
      details: ['Ask first: put the gate to the user through AskUserQuestion, then run route next.'],
    });
  }
  await recordAnswer(run, gate, { kind: 'default-taken', answer: gate.default, via: 'flag', instance: print?.id ?? null, object: (print?.['object'] as ArtifactRef | undefined) ?? null, revisePath: 'code' }, print?.['raisedBy'] as string | undefined);
}

/** A hook answer binds to the exact printed instance in this chain or it is unbound and changes nothing (03-G4, 03-G6). */
export async function recordHookAnswer(run: Run, answer: Answer & { question?: string }): Promise<void> {
  const unbound = (reason: string): Promise<Entry> =>
    append(run, { kind: 'declined', gate: answer.gate, instance: null, answer: answer.option, via: 'hook', unbound: true, reason });
  const chain = chainOf(run).entries;
  let print: Entry | undefined;
  if (answer.instance === undefined) {
    if (!answer.gate.startsWith('decision:')) return void (await unbound('no-instance'));
    const decision = gateFor(run, answer.gate);
    if (decision === null) return void (await unbound('unknown-gate'));
    print = await append(run, { kind: 'gate', gate: answer.gate, class: 'decision', question: answer.question ?? answer.gate, print: 1, options: [answer.option] });
    return recordAnswer(run, decision, { kind: 'acceptance', answer: answer.option, via: 'hook', instance: print.id, object: null, revisePath: 'gate' });
  }
  print = chain.find((entry) => entry.kind === 'gate' && entry.id === answer.instance);
  if (print === undefined) return void (await unbound('unknown-instance'));
  if (print['gate'] !== answer.gate) return void (await unbound('wrong-gate'));
  const gate = gateFor(run, answer.gate, print);
  if (gate === null) return void (await unbound('unknown-gate'));
  const options = (print['options'] as string[] | undefined) ?? gate.options;
  if (!offersOption(gate.id, options, answer.option) && gate.class !== 'decision' && gate.onAnswer['*'] === undefined) {
    await append(run, { kind: 'declined', gate: gate.id, instance: print.id, answer: answer.option, via: 'hook', reason: 'option-not-offered' });
    return;
  }
  await recordAnswer(run, gate, { kind: 'acceptance', answer: answer.option, via: 'hook', instance: print.id, object: (print['object'] as ArtifactRef | undefined) ?? null, revisePath: 'gate' }, print['raisedBy'] as string | undefined);
}

export type GateOutcome = { state: 'continue' } | { state: 'print'; print: Entry; gate: GateDef; retry: boolean };

/**
 * A gate at the position: convert a preanswer, take the headless default, take the default after three unanswered
 * prints, or print it (03-G3, 03-G7). `deliverOnly` reprints the latest print and writes nothing new.
 */
export async function serviceGate(run: Run, gate: GateDef, stepId: string): Promise<GateOutcome> {
  const step = run.def.steps.find((candidate) => candidate.id === stepId)!;
  const window = (): Entry[] => windowOf(foldRoute(run.def, chainOf(run)), step);
  const declaredStep = run.def.steps.find((candidate) => candidate.gate?.id === gate.id);
  const raisedBy = declaredStep === undefined ? stepId : undefined;
  const newPrint = async (): Promise<Entry> => {
    // A gate raised by this very run was just printed by the raise: that print is the one delivered.
    const raised = declaredStep === undefined ? latestPrint(window(), gate.id) : null;
    if (raised !== null && run.written.includes(raised.id) && raised['raisedBy'] === stepId) return raised;
    const prints = printsOf(chainOf(run).entries, gate.id).length;
    const source = latestPrint(window(), gate.id);
    const object = declaredStep === undefined ? null : objectOf(run, declaredStep);
    return append(run, {
      kind: 'gate',
      gate: gate.id,
      class: declaredStep === undefined ? (gate.class === 'decision' ? 'decision' : 'raised') : 'declared',
      question: gate.question,
      print: prints + 1,
      cause: run.cause,
      options: gate.options,
      ...(declaredStep === undefined ? { raisedBy: stepId, ...(source?.['values'] === undefined ? {} : { values: source['values'] }) } : {}),
      ...(object === null ? {} : { object }),
    });
  };

  const preanswer = run.deliverOnly ? null : unconsumedPreanswer(chainOf(run).entries, gate.id);
  if (preanswer !== null) {
    const print = await newPrint();
    const option = String(preanswer['option']);
    if (!gate.options.includes(option)) {
      await append(run, { kind: 'declined', gate: gate.id, instance: print.id, answer: option, via: 'prompt', reason: 'option-not-offered', preanswer: preanswer.id });
    } else {
      const trusted = preanswer['trusted'] === true;
      await recordAnswer(run, gate, { kind: 'acceptance', answer: option, via: 'prompt', instance: print.id, object: (print['object'] as ArtifactRef | undefined) ?? null, revisePath: trusted ? 'gate' : 'model', extra: { preanswer: preanswer.id, trusted } }, raisedBy);
      return { state: 'continue' };
    }
  }

  const prints = printsOf(window(), gate.id);
  const asked = askedCount(window(), gate.id);
  const takeDefault = async (print: Entry, via: string): Promise<GateOutcome> => {
    await recordAnswer(run, gate, { kind: 'default-taken', answer: gate.default, via, instance: print.id, object: (print['object'] as ArtifactRef | undefined) ?? null, revisePath: 'code' }, raisedBy);
    return { state: 'continue' };
  };
  if (run.head['mode'] === 'headless' && !run.deliverOnly) return takeDefault(prints.at(-1) ?? (await newPrint()), 'headless');
  if (run.deliverOnly) return { state: 'print', print: prints.at(-1) ?? (await newPrint()), gate, retry: false };
  if (prints.length >= 3 && preanswer === null) return takeDefault(prints.at(-1)!, asked === 0 ? 'never-asked' : 'unanswered');
  const latest = prints.at(-1);
  if (run.cause === 'route-next' && latest !== undefined && latest['cause'] === 'gate-hook') {
    const after = chainOf(run).entries.slice(chainOf(run).entries.indexOf(latest) + 1);
    if (!after.some((entry) => entry.kind === 'limit' && entry['which'] === 'gate-reprint-reused')) {
      await append(run, { kind: 'limit', which: 'gate-reprint-reused', step: stepId, count: 1 });
      return { state: 'print', print: latest, gate, retry: false };
    }
  }
  const print = await newPrint();
  const lastHook = window().findLast((entry) => entry['via'] === 'hook' && entry['gate'] === gate.id);
  return { state: 'print', print, gate, retry: lastHook?.['unbound'] === true && prints.length > 0 && chainOf(run).entries.indexOf(lastHook) > chainOf(run).entries.indexOf(prints.at(-1)!) };
}
