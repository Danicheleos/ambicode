import path from 'node:path';
import { gapsOf } from '#modules/evidence/report/report';
import { shellQuote } from '#modules/checks/run/run';
import { AmbicodeError } from '#util/errors';
import { exitRoute, reviseTo, serviceGate } from '../gates/answers.ts';
import { currentIn, exitOf, foldRoute, humanRevisesLeft, matches, windowOf } from './fold.ts';
import { gatePrintText, gateThen, raiseGate } from '../gates/gates.ts';
import { append, chainOf, gateFor, viewFor } from './run-context.ts';
import type { Runtime } from '#types/composition';
import type { CommandContext, GateDef, Handler, HandlerRegistry, RouteArgs, RouteRegistry, StepDef, StepMessage } from '#types/harness';
import type { Composed, DeliveryChannel, Part, Run } from '../types/engine.ts';
import type { Call } from '../definition/routes.ts';
import type { LedgerEntry, TaskDir } from '#types/modules/evidence';
import type { FileSystem } from '#types/platform/ports';

/** Causes from a command the model ran, as opposed to a hook or a resume. */
export const EXPLICIT: ReadonlySet<string> = new Set(['route-next', 'requirements normalize', 'check', 'rules apply', 'note save']);

const MAX_TURNS = 200;

type Fold = ReturnType<typeof foldRoute>;

const endsWithoutCommand = (step: StepDef): boolean => step.actor === 'model' && step.produces.length === 0;

/** A final model step with nothing after it. */
export const isClosing = (fold: Fold, step: StepDef): boolean => step.final && endsWithoutCommand(step) && fold.steps.slice(step.index + 1).every((state) => state.state === 'skipped' || state.skipsNow === true);

/** A model step whose final message is the note: the Stop hook saves it, so the model writes its answer once. */
export const answersAsNote = (step: StepDef): boolean => step.actor === 'model' && step.produces.some((produced) => produced.kind === 'note' && produced.value === 'investigation');

const quiet = (value: unknown): string => String(value ?? '');

/** The header's Route line; a pending step with a condition may still be skipped. */
function routeLine(fold: Fold, current: string): string {
  return fold.steps
    .filter((state) => state.state !== 'skipped' || state.step.id === current)
    .map(({ step, state }) => (step.id === current ? `${step.id} (now)` : state === 'done' ? `${step.id} (done)` : step.when !== null ? `${step.id} (if needed)` : step.id))
    .join(' · ');
}

interface EngineScope { runtime: Runtime; routes: RouteRegistry; handlers: HandlerRegistry; context: CommandContext; cli: string }

/** The advance loop: fold, run what is reachable, record, and compose what the caller prints. */
export function createExecutor(scope: EngineScope): { execute(run: Run): Promise<Part>; messageOf(run: Run, part: Part): StepMessage } {
  const { routes, handlers, context, cli } = scope;
  const commandFor = (tail: string): string => `${cli} ${tail}`;

  // A missing check is produced by the check command, not by `route next`.
  function checkCommand(run: Run, step: StepDef): string | null {
    const check = step.produces.find((produced) => produced.kind === 'check' && produced.value !== null);
    return check === undefined ? null : commandFor(`check --task ${run.task} --name <key> --file <file> --phase ${check.value} (key from checks.runnable)`);
  }

  const delegated = (run: Run, step: StepDef): string | null =>
    step.work === null ? null : `launch the subagent on ${workPath(run, step)}; when it returns, run ${commandFor(`route next --task ${run.task}`)}`;

  function producerHint(run: Run, step: StepDef): string {
    if (answersAsNote(step)) return 'your final message, which is saved as the note';
    const note = step.produces.find((produced) => produced.kind === 'note');
    if (note?.value) return commandFor(`note save --task ${run.task} --kind ${note.value}`);
    // A red check is run by the implementer, which needs the check command, not the launch it is already inside.
    return (run.cause === 'check' ? null : delegated(run, step)) ?? checkCommand(run, step) ?? commandFor(`route next --task ${run.task}`);
  }

  function endingCommand(run: Run, step: StepDef): string {
    if (answersAsNote(step)) return 'write your final message; it is saved as the note and checked';
    const note = step.produces.find((produced) => produced.kind === 'note');
    if (step.actor === 'model' && note?.value) return `${commandFor(`note save --task ${run.task} --kind ${note.value}`)} (note on standard input)`;
    const fallback = delegated(run, step) ?? checkCommand(run, step);
    if (fallback !== null) return fallback;
    // The command that records the last step's product completes the route, so `route next` after it fails.
    if (step.index === run.def.steps.length - 1 && step.produces.length > 0) return 'write your final message; no route command is needed';
    return commandFor(`route next --task ${run.task}`);
  }

  function messageOf(run: Run, part: Part): StepMessage {
    return { task: run.task, routeId: run.head.id, position: part.position, text: part.text, file: part.file, bytes: part.bytes, ledgerIds: [...run.written] };
  }

  async function partOf(run: Run, step: StepDef | null, header: string, body: string): Promise<{ part: Part; composed: Composed }> {
    const notes = run.notes.length === 0 ? '' : `${run.notes.join('\n')}\n\n`;
    const composed = compose({ header, body: `${notes}${body}`.trimEnd(), channel: run.channel, dir: run.dir, step: step?.id ?? 'complete' });
    return { part: { text: composed.text, file: composed.file, bytes: composed.bytes, position: step?.id ?? 'complete', full: composed.full }, composed };
  }

  // Without the recorded answers the model may call an accepted plan a draft; state what the ledger holds.
  function recordedLine(entries: readonly LedgerEntry[]): string {
    const answers = new Map<string, string>();
    for (const entry of entries) if (entry.kind === 'acceptance' && entry['unbound'] !== true) answers.set(String(entry['gate']), String(entry['answer']));
    const notes = new Map<string, string>();
    for (const entry of entries) if (entry.kind === 'note') notes.set(String(entry['note']), String(entry['path']));
    if (notes.has('plan')) notes.delete('plan-draft');
    const parts = [...[...answers].map(([gate, answer]) => `${gate}: ${answer}`), ...[...notes].map(([kind, file]) => `${kind} saved at ${file}`)];
    return parts.length === 0 ? '' : ` Recorded: ${parts.join('; ')}.`;
  }

  async function finish(run: Run): Promise<Part> {
    const chain = chainOf(run);
    const gaps = gapsOf(chain.entries, currentIn(run.def, chain));
    let status: string;
    const ended = exitOf(chain);
    if (ended !== null && ended['complete'] !== true) {
      status = `ended: ${ended['reason']}${ended['detail'] === undefined ? '' : ` (${quiet(ended['detail'])})`}`;
    } else {
      // An unverified completion still exits.
      if (ended === null) await exitRoute(run, 'done', undefined, { complete: true, unverified: gaps.length });
      status = gaps.length === 0 ? 'complete' : `complete, ${gaps.length} items not verified`;
    }
    const header = `[ambicode] ${run.def.skill} · task ${run.task} · ${status}`;
    // After `ended: human (no-check)` the model went on editing; the end says what is left to do.
    const after = 'Make no more edits or route calls; write your final message';
    const unverified = gaps.length === 0 ? '' : `Not verified:\n${gaps.map((gap) => `- ${gap}`).join('\n')}\n\nThe Stop hook blocks your final message once if it leaves one of these out.\n\n`;
    const body = status.startsWith('ended')
      ? `The route has ended.\n\n${unverified}${after}, saying why it ended.`
      : `The route is complete.${recordedLine(chain.entries)}\n\n${unverified}${after}: what was done in plain words${gaps.length === 0 ? '' : ', then each Not verified item'}.`;
    return (await partOf(run, null, header, body)).part;
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
    const text = gatePrintText({ task: run.task, gate, entry: print, object: (print['object'] as never) ?? null, revisesLeft: left, runner: cli });
    const position = (declared ?? step).id;
    const header = stepHeader({ skill: run.def.skill, task: run.task, step: position, position: (declared ?? step).index + 1, total: run.def.steps.length, now: `Put this question to the user: ${gate.question}`, then: gateThen(run.task, cli), route: routeLine(foldRoute(run.def, chainOf(run)), position) });
    return (await partOf(run, declared ?? step, header, text)).part;
  }

  async function runCode(run: Run, step: StepDef, fold: Fold): Promise<Part | null> {
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
          await savePayload(run.runtime.fs, run.dir, chainKey(view.chainIds), payloadKey(call), result.payload ?? '');
        Object.assign(record, result.record);
        if (result.exit !== undefined) exit = result.exit;
        if (result.exitDetail !== undefined) exitDetail = result.exitDetail;
        if (result.restart === true) run.restart = true;
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
    if (exit !== undefined) await exitRoute(run, exit, exitDetail, run.restart ? { complete: true } : {});
    return null;
  }

  async function failure(run: Run, step: StepDef, result: { code: string; message: string; recoverable: boolean; revise?: { args: Readonly<Record<string, readonly string[]>> } }): Promise<Part | null> {
    // A crash is not a result to record: the step has produced nothing, so it would run again forever.
    const record = step.onFail === 'record' && result.recoverable;
    const onFail = step.onFail === 'record' ? null : step.onFail;
    const args = onFail === null ? {} : { ...onFail.args, ...result.revise?.args };
    await append(run, { kind: 'step', step: step.id, actor: 'code', status: 'failed', cause: run.cause, code: result.code, message: result.message.slice(0, 300), ...(onFail === null ? {} : { revise: args }), ...(record ? { recorded: true } : {}) });
    if (record) {
      await append(run, { kind: 'step', step: step.id, actor: 'code', status: 'completed', cause: run.cause, failed: true });
      return null;
    }
    if (onFail !== null) {
      // The step ran and its result is on record; the failure is what the route wants redone (S4).
      await append(run, { kind: 'step', step: step.id, actor: 'code', status: 'completed', cause: run.cause, failed: true });
      await reviseTo(run, { target: onFail.target, args }, 'code', { reason: `${step.id}: ${result.code}`, raisedBy: step.id });
      return null;
    }
    const error = step.onError;
    if (error.kind === 'stop') {
      await exitRoute(run, error.reason, `${result.code}: ${result.message.slice(0, 200)}`);
      return finish(run);
    }
    throw new AmbicodeError(result.code, result.message, {});
  }

  async function runModel(run: Run, step: StepDef, fold: Fold): Promise<Part | null> {
    const window = windowOf(fold, step);
    const delivered = window.some((entry) => entry.kind === 'step' && entry['step'] === step.id && entry['status'] === 'delivered');
    let prefix = '';
    if (!run.deliverOnly && delivered && step.produces.length > 0 && EXPLICIT.has(run.cause)) {
      const again = window.filter((entry) => entry.kind === 'step' && entry['step'] === step.id && entry['status'] === 'repeated').length + 1;
      const missing = step.produces.filter((produced) => !window.some((entry) => matches(entry, produced))).map((produced) => `${produced.kind}${produced.value === null ? '' : `{${produced.value}}`}`);
      // Only route-next is the agent saying it is done; a check run mid-edit is work, not an attempt, and must not burn the repeat limit.
      if (run.cause === 'route-next') {
        if (again >= 3) {
          await append(run, { kind: 'limit', which: 'missing-produces', step: step.id, count: again });
          return null;
        }
        await append(run, { kind: 'step', step: step.id, actor: 'model', status: 'repeated', cause: run.cause });
      }
      prefix = `Not done yet: ${missing.join(', ')} is not on record. Produce it with: ${producerHint(run, step)}.\n\n`;
      // A red check would re-send the whole step, which the model already holds.
      if (run.cause === 'check') return (await partOf(run, step, `[ambicode] ${run.def.skill} · task ${run.task} · step ${step.id} (${step.index + 1}/${run.def.steps.length})`, prefix.trimEnd())).part;
    }
    // The request goes whole into a work file only where its text asks for it: the reviewer judges the code, not the author's goal.
    const request = ((run.head['args'] ?? {}) as RouteArgs).text.trim();
    const fill = (text: string): string => text.replaceAll('{cli}', cli).replaceAll('{task}', run.task).replaceAll('{work}', workPath(run, step)).replaceAll('{request}', request).replaceAll('{repo}', shellQuote(run.dir.repositoryRoot));
    const instruction = fill(step.instruction!);
    const nowLine = instruction.split('\n').find((line) => line.trim() !== '')!.replace(/^#+\s*/, '');
    // `Now:` carries the first line whole unless stepHeader clips it (over 160 and no backtick); a heading stays, it is the shape the step asks for.
    const flat = nowLine.replace(/\s+/g, ' ').trim();
    const body = /^\s*#/.test(instruction) || (flat.length > 160 && !flat.includes('`')) ? instruction : instruction.replace(/^\s*[^\n]*\n?/, '').trimStart();
    const launch: string[] = body === '' ? [] : [body];
    // A delegated step's own message only launches the subagent; everything it would have carried goes to the work file.
    const sections: string[] = step.work === null ? launch : [fill(step.work)];
    const start = fold.steps[step.index]!.windowStart;
    const reviseEntry = start > 0 ? fold.chain.entries[start - 1] : undefined;
    const reviseArgs = reviseEntry?.kind === 'revise' ? reviseArgsOf(fold.chain.entries, start, step) : undefined;
    for (const [key, values] of Object.entries(reviseArgs ?? {})) {
      if (values.length > 0) sections.push(`## ${key}\n${values.join('\n')}`);
    }
    // A code revise re-asks for the same inputs: the model has them, so only the revise text is new.
    const resent = step.work === null && reviseEntry?.kind === 'revise' && reviseEntry['via'] === 'code' && fold.chain.entries.slice(0, start).some((entry) => entry.kind === 'step' && entry['step'] === step.id && entry['status'] === 'delivered');
    const unchanged: string[] = [];
    for (const key of step.payload) {
      const chain = chainKey([...chainOf(run).ids]);
      const payload = await loadPayload(run.runtime.fs, run.dir, chain, key);
      if (payload === null || payload.trim() === '') continue;
      if (resent) unchanged.push(path.relative(run.dir.repositoryRoot, payloadFile(run.dir, chain, key)));
      else sections.push(`## ${key}\n${payload}`);
    }
    if (step.work !== null) {
      await run.runtime.fs.mkdirp(run.dir.steps);
      await run.runtime.fs.writeText(workPath(run, step), `<!-- ambicode work: ${run.def.skill}/${step.id}, task ${run.task} -->\n\n${sections.join('\n\n')}\n`);
      sections.splice(0, sections.length, ...launch);
    }
    if (unchanged.length > 0) sections.push(`Inputs unchanged since the last delivery: ${unchanged.join(', ')}`);
    const closing = isClosing(fold, step);
    const header = stepHeader({ skill: run.def.skill, task: run.task, step: step.id, position: step.index + 1, total: run.def.steps.length, now: nowLine, then: closing ? 'write your final message; no route command is needed' : endingCommand(run, step), route: routeLine(fold, step.id) });
    const { part, composed } = await partOf(run, step, header, `${prefix}${sections.join('\n\n')}`);
    if (!delivered) {
      const entry = await append(run, { kind: 'step', step: step.id, actor: 'model', status: 'delivered', cause: run.cause, channel: run.channel, bytes: part.bytes, ...(part.file === null ? {} : { file: part.file }) });
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

  /** Steps 2–6 of 12 §8: fold, check, run what is reachable, record, deliver. */
  async function execute(run: Run): Promise<Part> {
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
      } else {
        const outcome = await serviceGate(run, step.gate!, step.id);
        if (outcome.state === 'print') return gatePart(run, step, outcome);
      }
    }
    throw new AmbicodeError('internal', `Route ${run.def.skill} did not settle within ${MAX_TURNS} turns.`);
  }

  return { execute, messageOf };
}

export function handlerRegistry(handlers: Readonly<Record<string, Handler>>): HandlerRegistry {
  return { get: (name) => handlers[name] ?? null };
}

/** An approval revise into a step has no args; its findings are those of the latest revise into it, back to the first revise aimed at another step. */
function reviseArgsOf(entries: readonly LedgerEntry[], start: number, step: StepDef): Record<string, string[]> | undefined {
  for (let at = start - 1; at >= 0; at -= 1) {
    const entry = entries[at]!;
    if (entry.kind !== 'revise') continue;
    if (entry['from'] !== step.id) return undefined;
    const args = entry['args'] as Record<string, string[]> | undefined;
    if (Object.values(args ?? {}).some((values) => values.length > 0)) return args;
  }
  return undefined;
}

/** The key a step's `payload` list names a call's output by. */
function payloadKey(call: Call): string {
  switch (call.name) {
    case 'script': return `script:${call.params[0] ?? ''}`;
    case 'search.map': return 'map';
    // The activity is part of the key: the reviewer brief's stage must not overwrite the rules the task's own steps read.
    case 'policy.stage': return call.params.length > 1 ? `policy:${call.params.join(':')}` : `policy:${call.params[0] ?? ''}`;
    case 'requirements.normalize': return 'envelope';
    case 'task.start': return 'brief';
    case 'checks.baseline': return 'baseline';
    case 'evidence.report': return 'report';
    default: return call.name;
  }
}

export const CLI_LIMIT = 8000;
export const HOOK_LIMIT = 9800;
const PREVIEW_CHARS = 300;

/** The first route of a chain: it stays the same when a later route resumes it. */
export const chainKey = (ids: readonly string[]): string => ids.at(-1) ?? '';

/**
 * The lines every step message starts with: where we are, what to do now, the command that ends the step, and the
 * route around the step (skipped steps are left out).
 */
export function stepHeader(input: { skill: string; task: string; step: string; position: number; total: number; now: string; then: string; route?: string }): string {
  const now = input.now.replace(/\s+/g, ' ').trim();
  // A command in backticks is never cut: a cut one cannot be run.
  const clipped = now.length <= 160 || now.includes('`') ? now : `${now.slice(0, 157)}…`;
  return [
    `[ambicode] ${input.skill} · task ${input.task} · step ${input.step} (${input.position}/${input.total})`,
    `Now: ${clipped}`,
    `Then: ${input.then}`,
    ...(input.route === undefined ? [] : [`Route: ${input.route}`]),
  ].join('\n');
}

function compose(input: { header: string; body: string; channel: DeliveryChannel; dir: TaskDir; step: string }): Composed {
  const full = input.body === '' ? input.header : `${input.header}\n\n${input.body}`;
  const limit = input.channel === 'hook' ? HOOK_LIMIT : CLI_LIMIT;
  if (full.length <= limit) return { text: full, file: null, full, bytes: Buffer.byteLength(full) };
  const file = path.join(input.dir.steps, `step-${safe(input.step)}.md`);
  const bytes = Buffer.byteLength(full);
  const preview = input.body.slice(0, PREVIEW_CHARS);
  return { text: `${input.header}\n\n${preview}…\nRead it whole: ${bytes} bytes: ${file}`, file, full, bytes };
}

async function writeStepFile(fs: FileSystem, composed: Composed, comment: string): Promise<void> {
  if (composed.file === null) return;
  await fs.mkdirp(path.dirname(composed.file));
  await fs.writeText(composed.file, `<!-- ${comment} -->\n${composed.full}\n`);
}

const safe = (value: string): string => value.replace(/[^A-Za-z0-9_-]/g, '-');
/** Absolute: the subagent starts in the session's cwd, which can be a parent of the repository. */
const workPath = (run: Run, step: StepDef): string => path.join(run.dir.steps, `work-${safe(step.id)}.md`);
const payloadFile = (dir: TaskDir, route: string, key: string): string => path.join(dir.steps, `${safe(route)}-${safe(key)}.md`);

/** An empty payload is no file; removing the old one keeps a rerun of the step from delivering what it no longer produces. */
async function savePayload(fs: FileSystem, dir: TaskDir, route: string, key: string, text: string): Promise<void> {
  if (text.trim() === '') return fs.remove(payloadFile(dir, route, key));
  await fs.mkdirp(dir.steps);
  await fs.writeText(payloadFile(dir, route, key), text);
}

export async function loadPayload(fs: FileSystem, dir: TaskDir, chain: string, key: string): Promise<string | null> {
  return fs.readText(payloadFile(dir, chain, key)).catch(() => null);
}
