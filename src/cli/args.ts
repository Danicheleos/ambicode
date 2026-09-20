import { parseArgs as nodeParseArgs } from 'node:util';
import { AmbicodeError } from '../util/errors.ts';

/**
 * Accepts only what a command declares. `--` ends option parsing, since paths
 * can start with a dash.
 */
export interface OptionSpec {
  /** Flags taking a value, e.g. `--base <ref>`. */
  values?: readonly string[];
  /** Flags that are present or absent. */
  flags?: readonly string[];
  /** Value flags that may be repeated, collected in order. */
  repeated?: readonly string[];
}

export interface ParsedArgs {
  value(name: string): string | null;
  flag(name: string): boolean;
  all(name: string): string[];
  positionals: string[];
}

type NodeOption = { type: 'boolean' | 'string'; multiple?: boolean };

function toNodeOptions(spec: OptionSpec): Record<string, NodeOption> {
  const options: Record<string, NodeOption> = {};
  for (const name of spec.flags ?? []) options[name] = { type: 'boolean' };
  for (const name of spec.values ?? []) options[name] = { type: 'string' };
  for (const name of spec.repeated ?? []) options[name] = { type: 'string', multiple: true };
  return options;
}

export function parseArgs(command: string, argv: readonly string[], spec: OptionSpec): ParsedArgs {
  const options = toNodeOptions(spec);
  let parsed: ReturnType<typeof nodeParseArgs>;
  try {
    parsed = nodeParseArgs({
      args: [...argv],
      options,
      strict: true,
      allowPositionals: true,
      allowNegative: false,
    });
  } catch (error) {
    throw badArgument(command, spec, error);
  }

  const values = parsed.values as Record<string, string | boolean | string[] | undefined>;
  const single = new Set(spec.values ?? []);

  // `multiple: true` on a repeatable option gives an array even for one use;
  // a single-valued option used twice keeps only the last, which Node allows
  // and the commands treat as the operator's final word.
  return {
    value: (name: string) => {
      const found = values[name];
      if (typeof found === 'string') return found;
      if (Array.isArray(found)) return found.at(-1) ?? null;
      return null;
    },
    flag: (name: string) => values[name] === true,
    all: (name: string) => {
      const found = values[name];
      if (Array.isArray(found)) return [...found];
      return typeof found === 'string' && !single.has(name) ? [found] : [];
    },
    positionals: [...parsed.positionals],
  };
}

/** Node's messages name the token; the command and its own options come from us. */
function badArgument(command: string, spec: OptionSpec, error: unknown): AmbicodeError {
  const valued = [...(spec.values ?? []), ...(spec.repeated ?? [])];
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: unknown }).code;
  const summary =
    code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION'
      ? `Unknown option for "${command}": ${firstSentence(message)}`
      : firstSentence(message);
  return new AmbicodeError('bad-argument', summary, {
    field: command,
    details: [
      `Options: ${valued.map((value) => `--${value} <value>`).join(', ') || '(none)'}`,
      `Flags: ${(spec.flags ?? []).map((value) => `--${value}`).join(', ') || '(none)'}`,
    ],
  });
}

function firstSentence(message: string): string {
  const cut = message.indexOf('. ');
  return cut < 0 ? message : `${message.slice(0, cut)}.`;
}
