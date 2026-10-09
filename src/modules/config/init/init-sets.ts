import { AmbicodeError } from '#util/errors';
import type { SetPair } from '#types/modules/config';

const PROJECT_ID = '[a-z0-9]+(?:-[a-z0-9]+)*';

/** The only config slots the init choices and a dry-run `--set` may set (09-G3). */
const SETTABLE_KEYS: readonly RegExp[] = [
  /^requirements\.mcpServer$/,
  /^requirements\.acceptanceField$/,
  new RegExp(`^projects\\.(${PROJECT_ID})\\.commands\\.(lint|unit|typecheck|e2e|format)$`),
];

/** The model's slot name in a proposal as the config slot checks and policy refer to. */
export const configSlot = (slot: string): string => (slot === 'test' ? 'unit' : slot);

const bad = (raw: string, why: string): AmbicodeError =>
  new AmbicodeError('bad-argument', `--set ${raw}: ${why}.`, {
    field: '--set',
    details: ['Settable: requirements.mcpServer, requirements.acceptanceField, projects.<id>.commands.<lint|unit|typecheck|e2e|format>.'],
  });

function json(raw: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw bad(raw, 'the value is not valid JSON');
  }
}

/** `key=value`; a string value may be bare or JSON-quoted, a command is `null` or a JSON array of strings. */
export function parseSet(raw: string): SetPair {
  const at = raw.indexOf('=');
  if (at <= 0) throw bad(raw, 'expected <key>=<value>');
  const key = raw.slice(0, at).trim();
  const text = raw.slice(at + 1).trim();
  if (!SETTABLE_KEYS.some((pattern) => pattern.test(key))) throw bad(raw, `"${key}" is not a settable key`);
  if (text === 'null') {
    return { key, value: null };
  }
  if (key.startsWith('projects.')) {
    const value = json(raw, text);
    if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === 'string')) throw bad(raw, 'a command is null or a JSON array of at least one string');
    return { key, value: value as string[] };
  }
  const value = text.startsWith('"') ? json(raw, text) : text;
  if (typeof value !== 'string' || value === '') throw bad(raw, 'the value is a non-empty string');
  if (key === 'requirements.acceptanceField' && !/^customfield_\d+$/.test(value)) throw bad(raw, 'the acceptance field is a Jira id such as customfield_10010');
  return { key, value };
}

/** The project id a `projects.<id>.…` key names, or null. */
export const projectOfKey = (key: string): string | null => SETTABLE_KEYS[2]!.exec(key)?.[1] ?? null;

/** Parses every `--set`; a repeated key or an unknown project id is a bad argument. */
export function parseSets(raws: readonly string[], projects: readonly string[] | null = null): SetPair[] {
  const pairs = raws.map(parseSet);
  const seen = new Set<string>();
  for (const [index, pair] of pairs.entries()) {
    if (seen.has(pair.key)) throw bad(raws[index]!, `"${pair.key}" is set twice`);
    seen.add(pair.key);
    const project = projectOfKey(pair.key);
    if (project !== null && projects !== null && !projects.includes(project)) throw bad(raws[index]!, `no project "${project}" (projects: ${projects.join(', ')})`);
  }
  return pairs;
}

/** Sorted by key, `key=<JSON value>` joined by one space; '' for no pairs. */
export const canonicalSets = (pairs: readonly SetPair[]): string => setStrings(pairs).join(' ');

/** The pairs as sorted `key=<JSON value>` strings. */
export function setStrings(pairs: readonly SetPair[]): string[] {
  return [...pairs].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map((pair) => `${pair.key}=${JSON.stringify(pair.value)}`);
}
