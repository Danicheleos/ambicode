import { AmbicodeError } from '#util/errors';
import { PLATFORM, type PlatformFlags } from '#types/platform/claude';
import { RawGate, invalid, normalizeGate, parseYamlFile } from '../definition/dsl.ts';
import type { Runtime } from '#types/composition';
import type { TaskDir, LedgerEntry, LockedLedger, ArtifactRef } from '#types/modules/evidence';
import { type RouteView, type GateDef, type RouteRegistry } from '#types/harness';
import { hash12 } from '#util/hash';
import { isBoundAnswer } from '#modules/evidence/ledger-chain';

const DECISION_PREFIX = 'decision:';

export function parseRegistry(file: string, text: string, kinds: readonly string[]): GateDef[] {
  const document = parseYamlFile(file, text);
  if (document === null || typeof document !== 'object' || Array.isArray(document)) throw invalid(file, 'root', 'must be a mapping of gate ids');
  const gates: GateDef[] = [];
  for (const [key, value] of Object.entries(document)) {
    const parsed = RawGate.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw invalid(file, `gate ${key}`, `${issue?.path.join('.') || 'entry'}: ${issue?.message ?? 'invalid'}`);
    }
    const cls = key === `${DECISION_PREFIX}*` ? 'decision' : 'raised';
    gates.push(normalizeGate(file, key, cls, parsed.data, kinds));
  }
  return gates;
}

/** A standalone `{name…}` option expands to the values; `{name}` inside text is replaced by them joined, `{name|fallback}` by the fallback when there are none. */
function fill(text: string, values: Readonly<Record<string, readonly string[]>>): string {
  return text.replace(/\{(\w+)(?:\|([^}]*))?\}/g, (whole, name: string, fallback?: string) => (values[name] === undefined ? whole : values[name]!.length === 0 && fallback !== undefined ? fallback : values[name]!.join(', ')));
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
  };
  if (gate.class !== 'decision' && !instantiated.options.includes(instantiated.default)) {
    throw new AmbicodeError('route-invalid', `gate ${gate.id}: the instantiated options do not contain the default "${instantiated.default}".`);
  }
  if (instantiated.acting.includes(instantiated.default)) {
    throw new AmbicodeError('route-invalid', `gate ${gate.id}: an instantiated default is acting.`);
  }
  return instantiated;
}


const gateMarker = (gate: string, instance: string): string => `[ambicode gate ${gate} ${instance}]`;

interface PrintInput {
  task: string;
  gate: GateDef;
  entry: LedgerEntry;
  object: ArtifactRef | null;
  revisesLeft: number | null;
  platform?: PlatformFlags;
  runner?: string;
}

/** The block the model puts to the user verbatim (03-G9). */
export function gatePrintText(input: PrintInput): string {
  const { gate, entry, object } = input;
  const platform = input.platform ?? PLATFORM;
  const run = input.runner ?? 'ambicode';
  const offered = Array.isArray(entry['options']) ? (entry['options'] as string[]) : gate.options;
  const details = typeof entry['details'] === 'string' ? entry['details'] : '';
  const lines = [
    ...(details === '' ? [] : ['First write this to the chat as a normal message; the question window cannot show or select text:', details, '']),
    `Then ask: ${String(entry['question'] ?? gate.question)}`,
    'Options:',
  ];
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
  if (typeof entry['note'] === 'string') lines.push(entry['note']);
  lines.push(gateMarker(gate.id, entry.id));
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
    ? "The next step arrives with the user's answer. Do not run a route command before then. If the user dismisses the question, end your turn; the route pauses."
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

/** A raised question nobody answered before its route ended gets its default recorded, so no instance stays open for good. */
export async function settleOpenPrints(ledger: LockedLedger, routes: RouteRegistry, route: string): Promise<void> {
  const read = await ledger.read();
  if (read.state !== 'ok') return;
  const own = read.entries.filter((entry) => entry['route'] === route || entry.id === route);
  const skill = String(own.find((entry) => entry.kind === 'route')?.['skill'] ?? '');
  for (const print of own.filter((entry) => entry.kind === 'gate' && entry['class'] !== 'declared')) {
    if (own.some((entry) => isBoundAnswer(entry) && entry['instance'] === print.id)) continue;
    const definition = routes.gate(String(print['gate']));
    if (definition === null) continue;
    const { default: answer } = instantiateGate(definition, { skill, values: (print['values'] ?? {}) as Record<string, string[]> }, definition.id);
    await ledger.append({ kind: 'default-taken', route, gate: print['gate'], instance: print.id, answer, via: 'unanswered' });
  }
}

/** The option an answer names, in its declared spelling. AskUserQuestion labels arrive re-cased or with a trailing "(Recommended)". */
export const bareOption = (text: string): string => text.replace(/\s*\(Recommended\)\s*$/i, '').trim();

/** Also the label before " — " (`none` for `none — stop`) when exactly one option carries it. */
export const matchOption = (options: readonly string[], answer: string): string | null => {
  const key = (text: string): string => bareOption(text).toLowerCase();
  const exact = options.find((option) => key(option) === key(answer));
  const byLabel = options.filter((option) => key(option).split(' — ')[0] === key(answer));
  return exact ?? (byLabel.length === 1 ? byLabel[0]! : null);
};

/**
 * Print-time text for a gate. The question window cannot show selectable text or click a path, so `details` is written to
 * the chat before the question and the recorded question stays the declared one. `note` is an instruction to the model only.
 */
interface PrintShape { details?: string; note?: string; offered?: readonly string[]; values?: Readonly<Record<string, unknown>> }
type PrintShaper = (input: { runtime: Runtime; dir: TaskDir; task: string; chain: readonly LedgerEntry[]; gate: GateDef }) => Promise<PrintShape | null>;
const PRINT_SHAPERS = new Map<string, PrintShaper>();

export const onGatePrint = (gate: string, shaper: PrintShaper): void => void PRINT_SHAPERS.set(gate, shaper);

/** The details, note and options one print records; `offered` stays within the declared options and keeps the default. */
export async function shapePrint(gate: GateDef, input: Omit<Parameters<PrintShaper>[0], 'gate'>): Promise<{ question: string; details?: string; note?: string; options: readonly string[]; values?: Readonly<Record<string, unknown>> }> {
  const shape = (await PRINT_SHAPERS.get(gate.id)?.({ ...input, gate })) ?? null;
  if (shape === null) return { question: gate.question, options: gate.options };
  const offered = shape.offered ?? gate.options;
  if (offered.some((option) => !gate.options.includes(option)) || !offered.includes(gate.default)) {
    throw new AmbicodeError('internal', `gate ${gate.id}: a print offered options outside the declared ones or without the default.`);
  }
  return {
    question: gate.question,
    ...(shape.details === undefined || shape.details.trim() === '' ? {} : { details: shape.details }),
    ...(shape.note === undefined || shape.note.trim() === '' ? {} : { note: shape.note }),
    options: [...offered],
    ...(shape.values === undefined ? {} : { values: shape.values }),
  };
}
