import { canonicalUrl } from '../requirements/normalize.ts';
import { AmbicodeError } from '../util/errors.ts';
import { contentHash } from '../util/hash.ts';

export interface Answer { gate: string; option: string; instance?: string; freeText?: boolean }

/** Persisted in the `route` entry's `args` field (03-E8). */
export interface RouteArgs {
  text: string;
  requirements: readonly string[];
  project: string | null;
  plan: string | null;
  fromDraft: string | null;
  answers: readonly string[];
  headless: boolean;
  hasRequirement: boolean;
  hash: string;
}

export function parseAnswerFlag(value: string): Answer {
  const at = value.indexOf('=');
  if (at <= 0 || at === value.length - 1) throw new AmbicodeError('bad-argument', `--answer takes <gate>=<option>; got "${value}".`, { field: 'answer' });
  return { gate: value.slice(0, at).trim(), option: value.slice(at + 1).trim() };
}

const collapse = (text: string): string => text.trim().replace(/\s+/g, ' ');

/** Behavioural flags are part of the identity; `fresh`, `adopt`, `task` and output flags are not (D2). */
export function canonicalArgs(input: {
  text: string;
  requirements: readonly string[];
  project: string | null;
  plan?: string | null;
  fromDraft?: string | null;
  answers: readonly Answer[];
  headless: boolean;
  hasRequirement: boolean;
}): RouteArgs {
  const requirements = [...new Set(input.requirements.map(canonicalUrl))].sort();
  const answers = input.answers.map((answer) => `${answer.gate}=${answer.option}`).sort();
  const base = { text: collapse(input.text), requirements, project: input.project, plan: input.plan ?? null, fromDraft: input.fromDraft ?? null, answers, headless: input.headless };
  return { ...base, hasRequirement: input.hasRequirement, hash: contentHash(JSON.stringify(base)) };
}

/** Whitespace-separated words; single or double quotes group, a backslash escapes the next character. */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: string | null = null;
  let started = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === '\\' && index + 1 < text.length) {
      current += text[++index];
      started = true;
    } else if (quote !== null) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started) tokens.push(current);
      current = '';
      started = false;
    } else {
      current += char;
      started = true;
    }
  }
  if (started) tokens.push(current);
  return tokens;
}

export interface StartFlags {
  text: string;
  requirements: string[];
  task: string | null;
  project: string | null;
  headless: boolean;
  fresh: boolean;
  adopt: boolean;
  answers: Answer[];
}

/** The flags of `route start`, read from the words after `/ambicode:<skill>`; everything else is the request text. */
export function parseStartTokens(tokens: readonly string[]): StartFlags {
  const flags: StartFlags = { text: '', requirements: [], task: null, project: null, headless: false, fresh: false, adopt: false, answers: [] };
  const words: string[] = [];
  const value = (index: number, name: string): string => {
    const next = tokens[index + 1];
    if (next === undefined) throw new AmbicodeError('bad-argument', `--${name} needs a value.`, { field: name });
    return next;
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token === '--headless') flags.headless = true;
    else if (token === '--fresh') flags.fresh = true;
    else if (token === '--adopt') flags.adopt = true;
    else if (token === '--task') flags.task = value(index++, 'task');
    else if (token === '--project') flags.project = value(index++, 'project');
    else if (token === '--requirement') flags.requirements.push(value(index++, 'requirement'));
    else if (token === '--answer') flags.answers.push(parseAnswerFlag(value(index++, 'answer')));
    else words.push(token);
  }
  flags.text = words.join(' ');
  return flags;
}
