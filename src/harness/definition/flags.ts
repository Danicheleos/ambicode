import { AmbicodeError } from '#util/errors';
import { contentHash } from '#util/hash';
import type { Answer, ReviewTargetArgs, RouteArgs } from '#types/harness';

export function parseAnswerFlag(value: string): Answer {
  const at = value.indexOf('=');
  if (at <= 0 || at === value.length - 1) throw new AmbicodeError('bad-argument', `--answer takes <gate>=<option>; got "${value}".`, { field: 'answer' });
  return { gate: value.slice(0, at).trim(), option: value.slice(at + 1).trim() };
}

export const answersOf = (args: { all(name: string): string[] }): Answer[] => args.all('answer').map(parseAnswerFlag);

const collapse = (text: string): string => text.trim().replace(/\s+/g, ' ');

/** Behavioural flags are part of the identity; `task` and output flags are not (D2). */
export function canonicalArgs(input: {
  text: string;
  requirements: readonly string[];
  project: string | null;
  plan?: string | null;
  iteration: number | null;
  answers: readonly Answer[];
  headless: boolean;
  noReview?: boolean;
  hasRequirement: boolean;
  target?: ReviewTargetArgs;
}): RouteArgs {
  const requirements = [...new Set(input.requirements.map((value) => value.trim()))].sort();
  const answers = input.answers.map((answer) => `${answer.gate}=${answer.option}`).sort();
  const target = input.target === undefined ? {} : { target: input.target };
  const text = collapse(input.text);
  const typed = input.text.replace(/\r\n?/g, '\n').trim();
  const base = { text, requirements, project: input.project, plan: input.plan ?? null, answers, headless: input.headless, ...(input.noReview === true ? { noReview: true } : {}), ...target };
  return { ...base, ...(typed === text ? {} : { rawText: typed }), iteration: input.iteration, hasRequirement: input.hasRequirement, hash: contentHash(JSON.stringify(base)) };
}

