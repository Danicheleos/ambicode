import path from 'node:path';
import { CONTEXT_DIR } from '#types/defaults';
import { AmbicodeError } from '#util/errors';
import type { FileSystem } from '#types/platform/ports';

export interface ContextLimits { maxTotalTokens: number; maxFileTokens: number }
export interface ContextProblem { kind: string; message: string; file?: string }
export interface ContextFile { path: string; title: string; tokens: number }
export interface WriteOutcome { written: string[]; removed: string[]; check: { problems: ContextProblem[] } }

const ALLOWED = /^(overview|navigation|conventions|modules\/[a-z0-9]+(-[a-z0-9]+)*)\.md$/;
const HEADER = /^=== (\S.*?)\s*$/;
const FENCE = /^\s*(```|~~~)/;

/** chars / 4, rounded up: the same estimate the limits in config.context are written against. */
export const tokensOf = (text: string): number => Math.ceil(text.length / 4);

export function parseBundle(text: string): Map<string, string> {
  const files = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of text.split(/\r?\n/)) {
    const header = HEADER.exec(line);
    if (header !== null) {
      if (files.has(header[1]!)) throw new AmbicodeError('bad-argument', `duplicate path in bundle: ${header[1]}`, { field: 'bundle' });
      current = [];
      files.set(header[1]!, current);
    } else if (current !== null) current.push(line);
    else if (line.trim() !== '') throw new AmbicodeError('bad-argument', "bundle must start with a '=== <path>' line", { field: 'bundle' });
  }
  if (files.size === 0) throw new AmbicodeError('bad-argument', "empty bundle: no '=== <path>' sections", { field: 'bundle' });
  return new Map([...files].map(([name, lines]) => [name, `${lines.join('\n').trim()}\n`]));
}

const headings = (text: string, level: number): string[] =>
  text.split('\n').filter((line) => line.startsWith(`${'#'.repeat(level)} `)).map((line) => line.slice(level + 1).trim());

/** Problems in `files` as they would stand on disk; `existing` is what the bundle leaves in place. */
export function checkContext(files: ReadonlyMap<string, string>, limits: ContextLimits, existing: ReadonlyMap<string, string> = new Map()): ContextProblem[] {
  const problems: ContextProblem[] = [];
  const bad = (kind: string, message: string, file?: string): number => problems.push({ kind, message, ...(file === undefined ? {} : { file }) });
  const h1Owner = new Map<string, string>();
  let total = 0;
  for (const [name, text] of [...existing, ...files]) {
    total += tokensOf(text);
    if (!files.has(name)) { const h1 = headings(text, 1)[0]; if (h1 !== undefined) h1Owner.set(h1, name); }
  }
  for (const [name, text] of files) {
    if (!ALLOWED.test(name)) { bad('path', 'only overview.md, navigation.md, conventions.md and modules/<kebab-name>.md are accepted', name); continue; }
    const tokens = tokensOf(text);
    if (tokens > limits.maxFileTokens) bad('file-too-large', `~${tokens} tokens > maxFileTokens ${limits.maxFileTokens}`, name);
    if (text.split('\n').some((line) => FENCE.test(line))) bad('code-fence', 'code fences are not allowed; names only', name);
    const h1s = headings(text, 1);
    if (h1s.length !== 1) bad('h1', `needs exactly one H1 (the file's purpose), found ${h1s.length}`, name);
    else if (h1Owner.has(h1s[0]!)) bad('duplicate-h1', `H1 "${h1s[0]}" is also the H1 of ${h1Owner.get(h1s[0]!)}`, name);
    else h1Owner.set(h1s[0]!, name);
    const seen = new Set<string>();
    for (const h2 of headings(text, 2)) { if (seen.has(h2)) bad('duplicate-h2', `H2 "${h2}" appears twice`, name); seen.add(h2); }
  }
  if (total > limits.maxTotalTokens) bad('total-too-large', `~${total} tokens > maxTotalTokens ${limits.maxTotalTokens}`);
  return problems;
}

async function readAll(fs: FileSystem, dir: string, prefix = ''): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const entry of await fs.readdir(path.join(dir, prefix)).catch(() => [])) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) for (const [name, text] of await readAll(fs, dir, rel)) out.set(name, text);
    else if (entry.name.endsWith('.md')) out.set(rel, await fs.readText(path.join(dir, rel)));
  }
  return new Map([...out].sort(([a], [b]) => (a < b ? -1 : 1)));
}

export async function writeContext(fs: FileSystem, root: string, bundleText: string, limits: ContextLimits, replace: boolean): Promise<WriteOutcome> {
  const dir = path.join(root, CONTEXT_DIR);
  const bundle = parseBundle(bundleText);
  const onDisk = await readAll(fs, dir);
  const kept = new Map([...onDisk].filter(([name]) => !bundle.has(name) && !replace));
  const problems = checkContext(bundle, limits, kept);
  const written = [...bundle.keys()].sort();
  if (problems.length > 0) return { written: [], removed: [], check: { problems } };
  const removed = replace ? [...onDisk.keys()].filter((name) => !bundle.has(name)) : [];
  for (const name of removed) await fs.remove(path.join(dir, name));
  for (const [name, text] of bundle) {
    const target = path.join(dir, name);
    await fs.mkdirp(path.dirname(target));
    await fs.writeText(`${target}.tmp`, text);
    await fs.rename(`${target}.tmp`, target);
  }
  return { written, removed, check: { problems: [] } };
}

export async function listContext(fs: FileSystem, root: string): Promise<ContextFile[]> {
  return [...await readAll(fs, path.join(root, CONTEXT_DIR))].map(([name, text]) => ({ path: name, title: headings(text, 1)[0] ?? '', tokens: tokensOf(text) }));
}

export function renderListing(files: readonly ContextFile[], limits: ContextLimits): string {
  if (files.length === 0) return 'no context: run /ambicode:init';
  const total = files.reduce((sum, file) => sum + file.tokens, 0);
  return [...files.map((file) => `${file.path}  ${file.title}  ~${file.tokens} tokens`), `total ~${total} of ${limits.maxTotalTokens} tokens`].join('\n');
}
