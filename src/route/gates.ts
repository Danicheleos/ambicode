import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import type { Runtime } from '../composition/root.ts';
import type { TaskDir } from '../task/task-dir.ts';
import type { LedgerEntry } from '../task/ledger.ts';
import type { LockedLedger } from '../task/ledger-lock.ts';
import type { ArtifactRef } from '../task/kinds.ts';
import { AmbicodeError } from '../util/errors.ts';
import { PLATFORM, type PlatformFlags } from '../hook/events/platform.ts';
import type { RouteView } from './context.ts';
import type { RouteArgs } from './flags.ts';
import { invalid, normalizeGate, type GateDef } from './dsl.ts';
import type { RouteRegistry } from './routes.ts';

const RawEntry = z.strictObject({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(1),
  default: z.string().min(1),
  release: z.string().min(1),
  onAnswer: z.record(z.string(), z.string()).optional(),
  maxRevises: z.number().int().optional(),
  acting: z.array(z.string()).optional(),
  policy: z.record(z.string(), z.literal('stop')).optional(),
});

export const DECISION_PREFIX = 'decision:';

export function parseRegistry(file: string, text: string, kinds: readonly string[]): GateDef[] {
  let document: unknown;
  try {
    document = parseYaml(text);
  } catch (cause) {
    const line = (cause as { linePos?: { line: number }[] }).linePos?.[0]?.line;
    throw invalid(file, line === undefined ? 'yaml' : `line ${line}`, cause instanceof Error ? cause.message : String(cause));
  }
  if (document === null || typeof document !== 'object' || Array.isArray(document)) throw invalid(file, 'root', 'must be a mapping of gate ids');
  const gates: GateDef[] = [];
  for (const [key, value] of Object.entries(document)) {
    const parsed = RawEntry.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw invalid(file, `gate ${key}`, `${issue?.path.join('.') || 'entry'}: ${issue?.message ?? 'invalid'}`);
    }
    const cls = key === `${DECISION_PREFIX}*` ? 'decision' : 'raised';
    gates.push(normalizeGate(file, key, cls, parsed.data, kinds));
  }
  return gates;
}

export function registryGate(registry: readonly GateDef[], id: string): GateDef | null {
  return registry.find((gate) => gate.id === id) ?? (id.startsWith(DECISION_PREFIX) ? (registry.find((gate) => gate.class === 'decision') ?? null) : null);
}

/** A standalone `{name…}` option expands to the values; `{name}` inside text is replaced by them joined. */
function fill(text: string, values: Readonly<Record<string, readonly string[]>>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (values[name] === undefined ? whole : values[name]!.join(', ')));
}

/** Dynamic options (03-R8) and the registry `policy` override (03-G12), applied before a gate is validated or printed. */
export function instantiateGate(
  gate: GateDef,
  input: { skill: string; values: Readonly<Record<string, readonly string[]>> },
  id: string = gate.id,
): GateDef {
  const options: string[] = [];
  for (const option of gate.options) {
    const spread = /^\{(\w+)…\}$/.exec(option);
    if (spread !== null) options.push(...(input.values[spread[1]!] ?? []));
    else options.push(fill(option, input.values));
  }
  const stop = gate.policy[input.skill] === 'stop';
  const instantiated: GateDef = {
    ...gate,
    id,
    question: fill(gate.question, input.values),
    options: stop && !options.includes('stop') ? [...options, 'stop'] : options,
    default: stop ? 'stop' : fill(gate.default, input.values),
    release: stop ? 'stop' : fill(gate.release, input.values),
  };
  if (gate.class !== 'decision' && !instantiated.options.includes(instantiated.default)) {
    throw new AmbicodeError('route-invalid', `gate ${gate.id}: the instantiated options do not contain the default "${instantiated.default}".`);
  }
  if (instantiated.acting.includes(instantiated.default) || instantiated.acting.includes(instantiated.release)) {
    throw new AmbicodeError('route-invalid', `gate ${gate.id}: an instantiated default or release is acting.`);
  }
  return instantiated;
}

const hash12 = (hash: string): string => hash.replace(/^sha256:/, '').slice(0, 12);

export const gateMarker = (gate: string, instance: string): string => `[ambicode gate ${gate} ${instance}]`;
export const MARKER = /\[ambicode gate ([\w:.-]+)(?: ([\w-]+))?\]/;

export interface PrintInput {
  task: string;
  gate: GateDef;
  entry: LedgerEntry;
  object: ArtifactRef | null;
  revisesLeft: number | null;
  retry?: boolean;
  platform?: PlatformFlags;
  runner?: string;
}

/** The block the model puts to the user verbatim (03-G9). */
export function gatePrintText(input: PrintInput): string {
  const { gate, entry, object } = input;
  const platform = input.platform ?? PLATFORM;
  const run = input.runner ?? 'ambicode';
  const offered = Array.isArray(entry['options']) ? (entry['options'] as string[]) : gate.options;
  const lines = [String(entry['question'] ?? gate.question), 'Options:'];
  for (const option of offered) {
    const notes: string[] = [];
    if (option === gate.default) notes.push('default if nobody answers');
    if (gate.acting.includes(option)) notes.push('acts: only your own answer here counts');
    const revise = gate.onAnswer[option];
    const target = revise?.target === '$raisedBy' ? String(entry['raisedBy'] ?? revise.target) : revise?.target;
    if (revise !== undefined && input.revisesLeft !== null) {
      notes.push(input.revisesLeft > 0 ? `Revise (${input.revisesLeft} left): goes back to ${target}` : `Revise (0 left — restart the route to continue)`);
    } else if (revise !== undefined) notes.push(`goes back to ${target}`);
    lines.push(`  - ${option}${notes.length === 0 ? '' : ` (${notes.join('; ')})`}`);
  }
  if (object !== null) lines.push(`Object: ${object.path} ${hash12(object.contentHash)}`);
  lines.push(gateMarker(gate.id, entry.id));
  if (input.retry === true) lines.push('The last answer carried no usable marker: put the marker line above back into the question text.');
  const flagged = offered.filter((option) => !gate.acting.includes(option));
  if (platform.askBinding === 'supported') {
    lines.push('Ask the user with AskUserQuestion, with the marker line verbatim in the question text. The answer is recorded for you.');
  } else {
    lines.push(
      'Ask the user with AskUserQuestion, with the marker line verbatim in the question text.',
      `For an answer that does not act (${flagged.join(', ') || 'none'}) run: ${run} route next --task ${input.task} --answer ${gate.id}=<option>`,
      gate.acting.length === 0 ? '' : `An acting answer (${gate.acting.join(', ')}) is never taken from a flag; without the user's own answer the default stands.`,
    );
  }
  lines.push(platform.answerContext === 'supported'
    ? "The next step arrives with the user's answer. Do not run a route command before then."
    : `After the user answers, run: ${run} route next --task ${input.task}`);
  return lines.filter((line) => line !== '').join('\n');
}

/** The header's closing line for a printed gate (03-G9). */
export function gateThen(task: string, runner: string, platform: PlatformFlags = PLATFORM): string {
  return platform.answerContext === 'supported' ? "the user's answer brings the next step" : `${runner} route next --task ${task}`;
}

/** The one writer of a raised gate's print (03-G13): instantiated options, policy applied, `raisedBy` recorded. */
export async function raiseGate(
  ledger: LockedLedger,
  view: RouteView,
  input: { gate: string; values: Readonly<Record<string, readonly string[]>>; raisedBy: string; openAt?: string },
  routes: RouteRegistry,
): Promise<LedgerEntry> {
  const definition = routes.gate(input.gate);
  if (definition === null) throw new AmbicodeError('gate-unknown', `No gate "${input.gate}" in the registry.`);
  const gate = instantiateGate(definition, { skill: view.skill, values: input.values }, input.gate);
  const read = await ledger.read();
  const earlier = read.state === 'ok' ? read.entries.filter((entry) => entry.kind === 'gate' && entry.gate === gate.id && view.chainIds.includes(String(entry.route))).length : 0;
  return ledger.append({
    kind: 'gate',
    route: view.routeId,
    gate: gate.id,
    class: gate.class === 'decision' ? 'decision' : 'raised',
    raisedBy: input.raisedBy,
    ...(input.openAt === undefined ? {} : { openAt: input.openAt }),
    question: gate.question,
    print: earlier + 1,
    options: gate.options,
    values: input.values,
  });
}

/** Gates whose answer is open text after a fixed lead: the instantiated option lists the stored choices, not each subset. */
const OPEN_OPTIONS: Readonly<Record<string, RegExp>> = { 'requirements-expansion-capped': /^read these:\s*\S/ };

export const offersOption = (gate: string, options: readonly string[], option: string): boolean => options.includes(option) || OPEN_OPTIONS[gate]?.test(option) === true;

export type RaisedAnswerHandler = (input: { view: RouteView; ledger: LockedLedger; acceptance: LedgerEntry; routes: RouteRegistry }) => Promise<void>;
const ANSWER_HANDLERS = new Map<string, RaisedAnswerHandler>();

/** Runs once, inside the advance that folds the acceptance, when a raised gate gets a bound answer. */
export const onRaisedAnswer = (gate: string, handler: RaisedAnswerHandler): void => void ANSWER_HANDLERS.set(gate, handler);
export const raisedAnswerHandler = (gate: string): RaisedAnswerHandler | undefined => ANSWER_HANDLERS.get(gate);

/** A route's own command for a code step's unmet `needs` kind (08-R5); without one the engine prints its generic command. */
export type NeedCommand = (input: { runtime: Runtime; task: string; args: RouteArgs; chain: readonly LedgerEntry[] }) => Promise<string>;
const NEED_COMMANDS = new Map<string, NeedCommand>();
export const onNeedCommand = (skill: string, need: string, command: NeedCommand): void => void NEED_COMMANDS.set(`${skill}:${need}`, command);
export const needCommandFor = (skill: string, need: string): NeedCommand | undefined => NEED_COMMANDS.get(`${skill}:${need}`);

/** Print-time text and offered options a module adds to a gate's question (09-G1). */
export interface PrintShape { line: string; offered?: readonly string[] }
export type PrintShaper = (input: { runtime: Runtime; dir: TaskDir; task: string; chain: readonly LedgerEntry[]; gate: GateDef }) => Promise<PrintShape | null>;
const PRINT_SHAPERS = new Map<string, PrintShaper>();

export const onGatePrint = (gate: string, shaper: PrintShaper): void => void PRINT_SHAPERS.set(gate, shaper);

/** The question and options one print records; `offered` stays within the declared options and keeps default and release. */
export async function shapePrint(gate: GateDef, input: Omit<Parameters<PrintShaper>[0], 'gate'>): Promise<{ question: string; options: readonly string[] }> {
  const shape = (await PRINT_SHAPERS.get(gate.id)?.({ ...input, gate })) ?? null;
  if (shape === null) return { question: gate.question, options: gate.options };
  const offered = shape.offered ?? gate.options;
  const required = [gate.default, gate.release].filter((option) => gate.options.includes(option));
  if (offered.some((option) => !gate.options.includes(option)) || required.some((option) => !offered.includes(option))) {
    throw new AmbicodeError('internal', `gate ${gate.id}: a print offered options outside the declared ones or without the default and release.`);
  }
  return { question: shape.line === '' ? gate.question : `${gate.question}\n${shape.line}`, options: [...offered] };
}
