import path from 'node:path';
import type { Git } from '#platform/git/git';
import { harvest } from '#modules/search/declarations/harvest';
import { isAmbicodeError } from '#util/errors';
import { normalizeRelative, resolveInsideBoundary } from '#util/paths';
import type { FileSystem } from '#types/platform/ports';

/**
 * Plugin investigate runs read 26,032 bytes per run at the median, so one call covers a median run's reading.
 * No Bash result in the saved traces exceeds 29,800 characters, which suggests a 30,000 cap: `--budget` stays under it.
 */
export const READ_BUDGET_BYTES = 24_000;
export const READ_MAX_BUDGET_BYTES = 28_000;
/**
 * A whole-file operand over this many lines is answered with its declaration outline. Measured: 43 of 565 BE-express
 * source files (7.6%) and 25 of 257 `src/` files here exceed it; the be-vs-6140 lead service (428 lines, 11,843 B)
 * stays under it, so its first read is unchanged.
 */
export const READ_OUTLINE_LINES = 500;
/**
 * When a call's whole-file bodies would not fit the budget, whole-file operands over this many lines are outlined,
 * largest first, until they do. 100 is below the BE-express p75 (112 lines): a smaller file saves little. The
 * be-vs-6140 lead trio (13,745 B) fits 24,000 and stays bodies; be-vs-5973 R3's 11 files did not (5 cut).
 */
/**
 * Soft cap on one route's cumulative `read` bytes: past it the command still serves and records one limit.
 * be-vs-5973 R1 answered from 27,292 B in total; R3 served 55,625 B with no recall gain; be-vs-5941 R3 read 66,455 B
 * with no gain.
 */
export const READ_ROUTE_SOFT_BYTES = 60_000;
export const READ_BATCH_OUTLINE_MIN_LINES = 100;
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
  /** The declaration outline was served instead of the body; `--full` serves the body. */
  outline?: boolean;
  /** Every line asked for was served earlier in this route; the receipt that served them. `--again` re-reads. */
  deduped?: { receipt: string };
  /** The span asked for, when part of it was served earlier and this call served only the rest. */
  trimmed?: { from: number; to: number; receipt: string };
  /** The leading prefix (`./`, `repo/`) dropped to find the file; the header names the canonical path. */
  stripped?: string;
}

/** A span an earlier `read` receipt in this route chain served. */
export interface ServedSpan { path: string; from: number; to: number; receipt: string }

export interface ReadOptions { budget?: number; full?: boolean; again?: boolean; served?: readonly ServedSpan[] }

export interface ReadManyResult { files: ReadFile[]; text: string; bytes: number; truncated: number }

/** `path`, `path:12` (line 12 to the end) or a span as `path:12-40`, `path:12:40` or `path:12,40`. A drive letter's colon is never a span. */
export function parseReadOperand(value: string): ReadOperand {
  const match = /^(.+?):(\d+)(?:[-:,](\d+))?$/.exec(value);
  if (match === null) return { value, path: value, start: null, end: null };
  const start = Number(match[2]);
  const end = match[3] === undefined ? null : Number(match[3]);
  return { value, path: match[1]!, start: Math.max(1, start), end: end === null ? null : Math.max(start, end) };
}

interface Resolved { path: string; stripped?: string }
interface Unresolved { error: string }

async function existing(deps: ReadDeps, value: string): Promise<Resolved | Unresolved | null> {
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
  return null;
}

async function resolvePath(deps: ReadDeps, value: string, tracked: () => Promise<string[]>): Promise<Resolved | Unresolved> {
  const direct = await existing(deps, value);
  if (direct !== null) return direct;
  // Models prefix paths with `./`, the repository directory's name or the shell directory's name.
  const prefixes = ['./', `${path.basename(deps.repositoryRoot)}/`, `${path.basename(deps.cwd)}/`];
  for (const prefix of new Set(prefixes)) {
    if (prefix === '/' || !value.startsWith(prefix) || value.length === prefix.length) continue;
    const found = await existing(deps, value.slice(prefix.length));
    if (found !== null) return 'error' in found ? found : { ...found, stripped: prefix };
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
interface Whole { body: Body; path: string; all: string[] }

/** A declaration's range runs to the line before the next one; only top-level and one nesting level count, so locals do not bury the outline; an import line names declarations of other files (map.ts printed six at line 18). */
async function outlineOf(deps: ReadDeps, file: string, all: readonly string[], operand: string): Promise<string | null> {
  const declarations = await harvest(deps.fs, deps.repositoryRoot, [file], false);
  const indentOf = (line: string): number => /^[ \t]*/.exec(line)![0].length;
  const unit = Math.min(...all.filter((line) => line.trim() !== '' && indentOf(line) > 0).map(indentOf));
  const kept = declarations.filter((declaration) => !/^\s*import\b/.test(all[declaration.line - 1] ?? '') && (!Number.isFinite(unit) || indentOf(all[declaration.line - 1] ?? '') <= unit)).sort((a, b) => a.line - b.line);
  if (kept.length === 0) return null;
  const rows = kept.map((declaration, index) => `${declaration.name}  ${declaration.line}-${kept[index + 1]?.line === undefined ? all.length : Math.max(declaration.line, kept[index + 1]!.line - 1)}`);
  return [`== ${file} (outline: ${kept.length} declarations, ${all.length} lines) ==`, ...rows, `whole body: ambicode read --full ${operand}`].join('\n');
}

function uncovered(served: readonly ServedSpan[], file: string, from: number, to: number): { from: number; to: number; receipt: string } | null {
  const spans = served.filter((span) => span.path === file && span.to >= from && span.from <= to).sort((a, b) => a.from - b.from);
  let start = from;
  let end = to;
  let receipt = '';
  for (const span of spans) if (span.from <= start) { start = Math.max(start, span.to + 1); receipt = span.receipt; }
  for (const span of [...spans].reverse()) if (span.to >= end) { end = Math.min(end, span.from - 1); receipt ||= span.receipt; }
  return receipt === '' ? { from, to, receipt } : { from: start, to: end, receipt };
}

/**
 * Several files, or spans of them, in one bounded result. Every file gets an equal share of the budget, and
 * what a small file leaves unused goes to the larger ones; a file cut short says which span to ask for next.
 */
export async function readMany(given: ReadDeps, operands: readonly string[], options: ReadOptions = {}): Promise<ReadManyResult> {
  const budget = options.budget ?? READ_BUDGET_BYTES;
  const served = options.again === true ? [] : (options.served ?? []);
  const wholes: Whole[] = [];
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
    const stripped = resolved.stripped === undefined ? {} : { stripped: resolved.stripped };
    const key = `${resolved.path}:${operand.start ?? ''}-${operand.end ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const bytes = await deps.fs.readBytes(path.join(deps.repositoryRoot, resolved.path));
    if (bytes.subarray(0, BINARY_PROBE_BYTES).includes(0)) {
      bodies.push({ file: { operand: value, path: resolved.path, lines: null, truncated: false, error: 'binary; not shown', ...stripped }, header: `== ${resolved.path}: binary; not shown ==`, lines: [], size: 0 });
      continue;
    }
    const all = Buffer.from(bytes).toString('utf8').split('\n');
    if (all.at(-1) === '') all.pop();
    let from = Math.min(operand.start ?? 1, all.length + 1);
    let to = Math.min(operand.end ?? all.length, all.length);
    let earlier: ReadFile['trimmed'];
    if (to >= from && served.length > 0) {
      const rest = uncovered(served, resolved.path, from, to);
      if (rest !== null && rest.receipt !== '') {
        if (rest.to < rest.from) {
          bodies.push({ file: { operand: value, path: resolved.path, lines: null, truncated: false, error: null, deduped: { receipt: rest.receipt }, ...stripped }, header: `== ${resolved.path} (lines ${from}-${to}): served earlier (receipt ${rest.receipt}); add --again to re-read ==`, lines: [], size: 0 });
          continue;
        }
        earlier = { from, to, receipt: rest.receipt };
        from = rest.from;
        to = rest.to;
      }
    }
    const lines = all.slice(from - 1, to).map((line, index) => `${from + index}\t${line}`);
    const file: ReadFile = { operand: value, path: resolved.path, lines: to >= from ? { from, to, total: all.length } : null, truncated: false, error: to >= from ? null : `has ${all.length} lines; nothing at ${operand.start}`, ...stripped };
    if (earlier !== undefined) file.trimmed = earlier;
    const note = earlier === undefined ? '' : `; the rest of ${earlier.from}-${earlier.to} served earlier, receipt ${earlier.receipt}, --again re-reads`;
    const header = file.error === null ? `== ${resolved.path} (lines ${from}-${to} of ${all.length}${note}) ==` : `== ${resolved.path}: ${file.error} ==`;
    const body = { file, header, lines, size: lines.reduce((n, line) => n + Buffer.byteLength(line) + 1, 0) };
    bodies.push(body);
    if (operand.start === null && operand.end === null && earlier === undefined && file.error === null && all.length > READ_BATCH_OUTLINE_MIN_LINES) wholes.push({ body, path: resolved.path, all });
  }

  if (options.full !== true) {
    const outlined = new Set<Whole>();
    const tryOutline = async (whole: Whole): Promise<void> => {
      outlined.add(whole);
      const text = await outlineOf(deps, whole.path, whole.all, whole.path);
      if (text === null) return;
      whole.body.header = text;
      whole.body.lines = [];
      whole.body.size = 0;
      whole.body.file.lines = null;
      whole.body.file.outline = true;
    };
    for (const whole of wholes) if (whole.all.length > READ_OUTLINE_LINES) await tryOutline(whole);
    const total = (): number => bodies.reduce((n, body) => n + Buffer.byteLength(body.header) + 1 + body.size, 0);
    for (const whole of [...wholes].sort((a, b) => b.body.size - a.body.size)) {
      if (total() <= budget) break;
      if (!outlined.has(whole)) await tryOutline(whole);
    }
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
