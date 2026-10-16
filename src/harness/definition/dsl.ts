import { z } from 'zod';
import { AmbicodeError } from '#util/errors';
import { EXITS, type Qualified, type Call, type Revise, type OnError, type Exit, type When, type GateDef } from '#types/harness';

export function invalid(file: string, where: string, message: string): AmbicodeError {
  return new AmbicodeError('route-invalid', `${file}: ${where}: ${message}`, { field: where });
}

export function parseQualified(file: string, where: string, text: string, kinds: readonly string[]): Qualified {
  const match = /^([a-z-]+)(?:\{([^{}]+)\})?$/.exec(text.trim());
  if (match === null) throw invalid(file, where, `"${text}" is not kind or kind{value}`);
  const [, kind, value] = match as unknown as [string, string, string | undefined];
  if (!kinds.includes(kind)) throw invalid(file, where, `"${kind}" is not a ledger kind`);
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
  const reason = /^stop:(\w+)$/.exec(text.trim())?.[1];
  if (reason === undefined || !(EXITS as readonly string[]).includes(reason)) throw invalid(file, where, `"${text}" is not stop:<reason>`);
  return { kind: 'stop', reason: reason as Exit };
}

const SIMPLE_WHEN = ['args.hasRequirement', 'args.hasMergeRequest', 'map.empty', 'plan.isDraft', 'revised'];

export function parseWhen(file: string, where: string, text: string): When {
  const trimmed = text.trim();
  if (SIMPLE_WHEN.includes(trimmed)) return { predicate: trimmed as never };
  const is = /^gate\.([\w:-]+)\.(is|isnt)\((.+)\)$/.exec(trimmed);
  if (is !== null) return { predicate: is[2] === 'is' ? 'gate.is' : 'gate.isnt', gate: is[1]!, option: is[3]!.trim() };
  throw invalid(file, where, `"${text}" is not in the when vocabulary`);
}

/** One gate as written in a route step or in `routes/gates.yaml`; `policy` is registry-only. */
export const RawGate = z.strictObject({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(1),
  default: z.string().min(1),
  onAnswer: z.record(z.string(), z.string()).optional(),
  repeat: z.number().int().min(1).optional(),
  acting: z.array(z.string()).optional(),
  object: z.string().optional(),
  policy: z.record(z.string(), z.literal('stop')).optional(),
});

/** Human revises a gate allows before it declines the next one; 3 was the default of every shipped gate but init's. */
const DEFAULT_GATE_REPEAT = 3;

export function normalizeGate(file: string, id: string, cls: GateDef['class'], raw: z.infer<typeof RawGate>, kinds: readonly string[]): GateDef {
  const where = `gate ${id}`;
  const acting = raw.acting ?? [];
  const options = raw.options;
  for (const name of acting) if (!options.includes(name)) throw invalid(file, `${where}.acting`, `"${name}" is not one of the options`);
  if (cls !== 'decision' && !options.includes(raw.default)) throw invalid(file, `${where}.default`, `"${raw.default}" is not one of the options`);
  if (acting.includes(raw.default)) throw invalid(file, `${where}.default`, `"${raw.default}" is acting; a default is never acting`);
  const onAnswer: Record<string, Revise> = {};
  for (const [key, text] of Object.entries(raw.onAnswer ?? {})) {
    if (key !== '*' && !options.includes(key)) throw invalid(file, `${where}.onAnswer`, `"${key}" is neither an option nor "*"`);
    onAnswer[key] = parseRevise(file, `${where}.onAnswer.${key}`, text);
  }
  return {
    id,
    class: cls,
    question: raw.question,
    options: [...options],
    default: raw.default,
    acting: [...acting],
    onAnswer,
    repeat: raw.repeat ?? DEFAULT_GATE_REPEAT,
    object: raw.object === undefined ? null : parseQualified(file, `${where}.object`, raw.object, kinds),
    policy: raw.policy ?? {},
  };
}
