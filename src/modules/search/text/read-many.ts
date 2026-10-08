import path from 'node:path';
import type { Git } from '#platform/git/git';
import { isAmbicodeError } from '#util/errors';
import { normalizeRelative, resolveInsideBoundary } from '#util/paths';
import type { FileSystem } from '#types/platform/ports';

/**
 * Plugin investigate runs read 26,032 bytes per run at the median, so one call covers a median run's reading.
 * No Bash result in the saved traces exceeds 29,800 characters, which suggests a 30,000 cap: `--budget` stays under it.
 */
export const READ_BUDGET_BYTES = 24_000;
export const READ_MAX_BUDGET_BYTES = 28_000;
const BINARY_PROBE_BYTES = 8000;
const AMBIGUOUS_SHOWN = 5;

export interface ReadOperand { value: string; path: string; start: number | null; end: number | null }

export interface ReadFile {
  operand: string;
  path: string | null;
  /** Lines served, 1-based and inclusive; null when nothing was served. */
  lines: { from: number; to: number; total: number } | null;
  truncated: boolean;
  error: string | null;
}

export interface ReadManyResult { files: ReadFile[]; text: string; bytes: number; truncated: number }

/** `path`, `path:12` (line 12 to the end) or `path:12-40`. A drive letter's colon is never a range. */
export function parseReadOperand(value: string): ReadOperand {
  const match = /^(.+?):(\d+)(?:-(\d+))?$/.exec(value);
  if (match === null) return { value, path: value, start: null, end: null };
  const start = Number(match[2]);
  const end = match[3] === undefined ? null : Number(match[3]);
  return { value, path: match[1]!, start: Math.max(1, start), end: end === null ? null : Math.max(start, end) };
}

interface Resolved { path: string }
interface Unresolved { error: string }

async function resolvePath(deps: ReadDeps, value: string, tracked: () => Promise<string[]>): Promise<Resolved | Unresolved> {
  // From the shell's directory first, then from the repository root.
  const fromCwd = path.relative(deps.repositoryRoot, path.resolve(deps.cwd, value));
  for (const candidate of new Set(path.isAbsolute(value) ? [fromCwd] : [fromCwd, value])) {
    if (!(await deps.fs.exists(path.resolve(deps.repositoryRoot, candidate)))) continue;
    try {
      const real = await resolveInsideBoundary(deps.fs, deps.repositoryRoot, candidate, value);
      const relative = normalizeRelative(path.relative(deps.repositoryRoot, real));
      if (relative === '.git' || relative.startsWith('.git/')) return { error: 'inside .git; not read' };
      if (!(await deps.fs.stat(real)).isFile()) return { error: 'not a file; name the files inside it' };
      return { path: relative };
    } catch (error) {
      if (isAmbicodeError(error)) return { error: 'outside the repository; not read' };
      throw error;
    }
  }
  // The model often names a path from the map's project root or by its tail: a unique tracked suffix is that file.
  const suffix = normalizeRelative(value);
  const matches = (await tracked()).filter((file) => file === suffix || file.endsWith(`/${suffix}`));
  if (matches.length === 1) return { path: matches[0]! };
  if (matches.length > 1) return { error: `ambiguous: ${matches.slice(0, AMBIGUOUS_SHOWN).join(', ')}${matches.length > AMBIGUOUS_SHOWN ? `, ${matches.length - AMBIGUOUS_SHOWN} more` : ''}` };
  return { error: 'not found' };
}

const cutLine = (budget: number, file: string, stop: number, to: number): string => `… cut by the ${budget}-byte budget at line ${stop}: read ${file}:${stop}-${to} for the rest`;

export interface ReadDeps { fs: FileSystem; git: Git; repositoryRoot: string; cwd: string }

interface Body { file: ReadFile; header: string; lines: string[]; size: number }

/**
 * Several files, or spans of them, in one bounded result. Every file gets an equal share of the budget, and
 * what a small file leaves unused goes to the larger ones; a file cut short says which span to ask for next.
 */
export async function readMany(given: ReadDeps, operands: readonly string[], budget = READ_BUDGET_BYTES): Promise<ReadManyResult> {
  // Real paths on both sides: on macOS the shell's /tmp and git's /private/tmp are one directory under two names.
  const deps = { ...given, repositoryRoot: await given.fs.realpath(given.repositoryRoot), cwd: await given.fs.realpath(given.cwd) };
  let listed: string[] | null = null;
  const tracked = async (): Promise<string[]> => (listed ??= await deps.git.listFiles(null));
  const bodies: Body[] = [];
  const seen = new Set<string>();
  for (const value of operands) {
    const operand = parseReadOperand(value);
    const resolved = await resolvePath(deps, operand.path, tracked);
    if ('error' in resolved) {
      bodies.push({ file: { operand: value, path: null, lines: null, truncated: false, error: resolved.error }, header: `== ${value}: ${resolved.error} ==`, lines: [], size: 0 });
      continue;
    }
    const key = `${resolved.path}:${operand.start ?? ''}-${operand.end ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const bytes = await deps.fs.readBytes(path.join(deps.repositoryRoot, resolved.path));
    if (bytes.subarray(0, BINARY_PROBE_BYTES).includes(0)) {
      bodies.push({ file: { operand: value, path: resolved.path, lines: null, truncated: false, error: 'binary; not shown' }, header: `== ${resolved.path}: binary; not shown ==`, lines: [], size: 0 });
      continue;
    }
    const all = Buffer.from(bytes).toString('utf8').split('\n');
    if (all.at(-1) === '') all.pop();
    const from = Math.min(operand.start ?? 1, all.length + 1);
    const to = Math.min(operand.end ?? all.length, all.length);
    const lines = all.slice(from - 1, to).map((line, index) => `${from + index}\t${line}`);
    const file: ReadFile = { operand: value, path: resolved.path, lines: to >= from ? { from, to, total: all.length } : null, truncated: false, error: to >= from ? null : `has ${all.length} lines; nothing at ${operand.start}` };
    const header = file.error === null ? `== ${resolved.path} (lines ${from}-${to} of ${all.length}) ==` : `== ${resolved.path}: ${file.error} ==`;
    bodies.push({ file, header, lines, size: lines.reduce((n, line) => n + Buffer.byteLength(line) + 1, 0) });
  }

  // Headers always print; the lines share what is left.
  let left = budget - bodies.reduce((n, body) => n + Buffer.byteLength(body.header) + 1, 0);
  const allotment = new Map<Body, number>();
  const footer = (body: Body): number => Buffer.byteLength(cutLine(budget, body.file.path!, body.file.lines!.to, body.file.lines!.to)) + 1;
  const bySize = bodies.filter((body) => body.lines.length > 0).sort((a, b) => a.size - b.size);
  bySize.forEach((body, index) => {
    const share = Math.max(0, Math.floor(left / (bySize.length - index)));
    const granted = body.size <= share ? body.size : Math.max(0, share - footer(body));
    allotment.set(body, granted);
    left -= granted + (granted < body.size ? footer(body) : 0);
  });

  const out: string[] = [];
  let truncated = 0;
  for (const body of bodies) {
    out.push(body.header);
    if (body.lines.length === 0) continue;
    let size = 0;
    let kept = 0;
    for (const line of body.lines) {
      const next = size + Buffer.byteLength(line) + 1;
      if (next > allotment.get(body)!) break;
      size = next;
      kept += 1;
    }
    out.push(...body.lines.slice(0, kept));
    if (kept < body.lines.length) {
      const { from, to } = body.file.lines!;
      const stop = from + kept;
      body.file.truncated = true;
      body.file.lines = kept === 0 ? null : { ...body.file.lines!, to: stop - 1 };
      truncated += 1;
      out.push(cutLine(budget, body.file.path!, stop, to));
    }
  }
  const text = out.join('\n');
  return { files: bodies.map((body) => body.file), text, bytes: Buffer.byteLength(text), truncated };
}
