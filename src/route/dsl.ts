import { AmbicodeError } from '../util/errors.ts';

export const EXITS = ['done', 'blocked', 'human', 'inconclusive', 'superseded', 'budget'] as const;
export type Exit = (typeof EXITS)[number];

export interface Qualified { kind: string; value: string | null }
export interface Call { name: string; params: readonly string[] }
export interface Revise { target: string; args: Readonly<Record<string, readonly string[]>> }
export type OnError =
  | { kind: 'default' }
  | { kind: 'retry-with'; hint: string }
  | { kind: 'ask'; gate: string }
  | { kind: 'stop'; reason: Exit };

export type When =
  | { predicate: 'args.hasRequirement' | '!args.hasRequirement' | 'map.empty' | 'plan.isDraft' | 'headless' | 'interactive' | 'index.present' }
  | { predicate: 'gate.answered'; gate: string }
  | { predicate: 'gate.is'; gate: string; option: string };

export interface GateDef {
  id: string;
  class: 'declared' | 'raised' | 'decision';
  question: string;
  options: readonly string[];
  default: string;
  release: string;
  acting: readonly string[];
  onAnswer: Readonly<Record<string, Revise>>;
  maxRevises: number;
  object: Qualified | null;
  policy: Readonly<Record<string, 'stop'>>;
}

export const RAISED_BY = '$raisedBy';

/** The field of a kind that a `kind{value}` qualifier is checked against. */
export const QUALIFIERS: Readonly<Record<string, readonly string[]>> = {
  note: ['investigation', 'plan-draft', 'plan', 'notes'],
  policy: ['before-work', 'before-checks', 'before-report'],
  check: ['green'],
  requirement: ['full', 'list'],
};

export function invalid(file: string, where: string, message: string): AmbicodeError {
  return new AmbicodeError('route-invalid', `${file}: ${where}: ${message}`, { field: where });
}

export function parseQualified(file: string, where: string, text: string, kinds: readonly string[]): Qualified {
  const match = /^([a-z-]+)(?:\{([^{}]+)\})?$/.exec(text.trim());
  if (match === null) throw invalid(file, where, `"${text}" is not kind or kind{value}`);
  const [, kind, value] = match as unknown as [string, string, string | undefined];
  if (!kinds.includes(kind)) throw invalid(file, where, `"${kind}" is not a ledger kind`);
  if (value !== undefined) {
    const allowed = QUALIFIERS[kind];
    if (allowed === undefined) throw invalid(file, where, `"${kind}" takes no qualifier`);
    if (!allowed.includes(value)) throw invalid(file, where, `"${value}" is not a ${kind} qualifier; expected ${allowed.join(', ')}`);
  }
  return { kind, value: value ?? null };
}

export function parseCall(file: string, where: string, text: string): Call {
  const match = /^([A-Za-z][\w.]*)(?:\((.*)\))?$/.exec(text.trim());
  if (match === null) throw invalid(file, where, `"${text}" is not name or name(params)`);
  const params = match[2] === undefined || match[2].trim() === '' ? [] : match[2].split(',').map((part) => part.trim());
  return { name: match[1]!, params };
}

export function parseRevise(file: string, where: string, text: string): Revise {
  const tokens = text.trim().split(/\s+/);
  if (tokens[0] !== 'revise' || tokens[1] === undefined) throw invalid(file, where, `"${text}" is not "revise <step> [--name value]"`);
  const args: Record<string, string[]> = {};
  for (let index = 2; index < tokens.length; index += 2) {
    const name = tokens[index];
    const value = tokens[index + 1];
    if (name === undefined || !name.startsWith('--') || value === undefined) throw invalid(file, where, `"${text}" has a malformed argument`);
    (args[name.slice(2)] ??= []).push(value);
  }
  return { target: tokens[1], args };
}

export function parseOnError(file: string, where: string, text: string): OnError {
  const trimmed = text.trim();
  const stop = /^stop:(\w+)$/.exec(trimmed);
  if (stop !== null) {
    if (!(EXITS as readonly string[]).includes(stop[1]!)) throw invalid(file, where, `"${stop[1]}" is not an exit reason`);
    return { kind: 'stop', reason: stop[1] as Exit };
  }
  const retry = /^retry-with\s+(.+)$/.exec(trimmed);
  if (retry !== null) return { kind: 'retry-with', hint: retry[1]! };
  const ask = /^ask\s+(\S+)$/.exec(trimmed);
  if (ask !== null) return { kind: 'ask', gate: ask[1]! };
  throw invalid(file, where, `"${text}" is not retry-with <hint>, ask <gate> or stop:<reason>`);
}

const SIMPLE_WHEN = ['args.hasRequirement', '!args.hasRequirement', 'map.empty', 'plan.isDraft', 'headless', 'interactive', 'index.present'];

export function parseWhen(file: string, where: string, text: string): When {
  const trimmed = text.trim();
  if (SIMPLE_WHEN.includes(trimmed)) return { predicate: trimmed as never };
  const answered = /^gate\.([\w:-]+)\.answered$/.exec(trimmed);
  if (answered !== null) return { predicate: 'gate.answered', gate: answered[1]! };
  const is = /^gate\.([\w:-]+)\.is\((.+)\)$/.exec(trimmed);
  if (is !== null) return { predicate: 'gate.is', gate: is[1]!, option: is[2]!.trim() };
  throw invalid(file, where, `"${text}" is not in the when vocabulary`);
}

export interface RawGate {
  question: string;
  options: string[];
  default: string;
  release: string;
  onAnswer?: Record<string, string> | undefined;
  maxRevises?: number | undefined;
  acting?: string[] | undefined;
  object?: string | undefined;
  policy?: Record<string, 'stop'> | undefined;
}

export function normalizeGate(file: string, id: string, cls: GateDef['class'], raw: RawGate, kinds: readonly string[]): GateDef {
  const where = `gate ${id}`;
  const acting = raw.acting ?? [];
  const options = raw.options;
  for (const name of acting) if (!options.includes(name)) throw invalid(file, `${where}.acting`, `"${name}" is not one of the options`);
  if (cls !== 'decision' && !options.includes(raw.default)) throw invalid(file, `${where}.default`, `"${raw.default}" is not one of the options`);
  if (acting.includes(raw.default)) throw invalid(file, `${where}.default`, `"${raw.default}" is acting; a default is never acting`);
  if (raw.release === '') throw invalid(file, `${where}.release`, 'a gate needs a release');
  if (acting.includes(raw.release)) throw invalid(file, `${where}.release`, `"${raw.release}" is acting; a release is never acting`);
  const onAnswer: Record<string, Revise> = {};
  for (const [key, text] of Object.entries(raw.onAnswer ?? {})) {
    if (key !== '*' && !options.includes(key)) throw invalid(file, `${where}.onAnswer`, `"${key}" is neither an option nor "*"`);
    onAnswer[key] = parseRevise(file, `${where}.onAnswer.${key}`, text);
  }
  const maxRevises = raw.maxRevises ?? 3;
  if (!Number.isInteger(maxRevises) || maxRevises < 1) throw invalid(file, `${where}.maxRevises`, 'must be at least 1');
  return {
    id,
    class: cls,
    question: raw.question,
    options: [...options],
    default: raw.default,
    release: raw.release,
    acting: [...acting],
    onAnswer,
    maxRevises,
    object: raw.object === undefined ? null : parseQualified(file, `${where}.object`, raw.object, kinds),
    policy: raw.policy ?? {},
  };
}
