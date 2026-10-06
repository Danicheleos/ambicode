import { canonicalUrl } from '#modules/requirements/envelope/normalize';
import { AmbicodeError } from '#util/errors';
import { contentHash } from '#util/hash';
import type { Answer, ReviewTargetArgs, RouteArgs } from '#types/harness';

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
  target?: ReviewTargetArgs;
}): RouteArgs {
  const requirements = [...new Set(input.requirements.map(canonicalUrl))].sort();
  const answers = input.answers.map((answer) => `${answer.gate}=${answer.option}`).sort();
  const target = input.target === undefined ? {} : { target: input.target };
  const base = { text: collapse(input.text), requirements, project: input.project, plan: input.plan ?? null, fromDraft: input.fromDraft ?? null, answers, headless: input.headless, ...target };
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

