import path from 'node:path';
import { CONTEXT_DIR, MAX_SNAPSHOT_FILE_BYTES } from '#types/defaults';
import { AmbicodeError } from '#util/errors';
import { isSearchable, isTestPath } from '#util/path-classes';
import { harvest } from '#modules/search/harvest';
import type { FileSystem } from '#types/platform/ports';

interface ContextLimits { maxTotalTokens: number; maxFileTokens: number; maxIndexTokens: number }
interface ContextProblem { kind: string; message: string; file?: string }
interface ContextFile { path: string; title: string; tokens: number }
interface WriteOutcome { written: string[]; removed: string[]; check: { problems: ContextProblem[] } }

const safeSegment = (segment: string): string => segment.replace(/[^A-Za-z0-9._-]/g, '_');
const ALLOWED = /^(overview|navigation|conventions|index|modules\/([A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+)\.md$/;
/** A note mirrors a directory, so a segment may be anything a directory name is except a traversal. */
const isAllowedPath = (name: string): boolean => ALLOWED.test(name) && !name.split('/').some((segment) => segment === '.' || segment === '..');
const HEADER = /^=== (\S.*?)\s*$/;
const FENCE = /^\s*(```|~~~)/;
const INDEX = 'index.md';
const INDEX_FOLDER = /^(?: {2})*- \[([^\]\n]+)\]\(([^)\n]+)\)(?: - \S.*?)?(?: \| \S.*)?$/;

/** The folder tree: one linked folder line per module, optionally followed by ` - <description>` and ` | <names>`. Links must name known notes. */
function checkIndex(text: string, known: ReadonlySet<string>, bad: (kind: string, message: string, file?: string) => number): void {
  for (const [i, line] of text.split('\n').entries()) {
    if (line === '' || line.startsWith('#')) continue;
    const folder = INDEX_FOLDER.exec(line);
    if (folder === null) bad('index-line', `line ${i + 1}: expected '- [<dir>](<note path>)' with an optional ' - <description>'`, INDEX);
    else if (!known.has(folder[2]!)) bad('index-link', `line ${i + 1}: link ${folder[2]} is not a context file`, INDEX);
  }
}

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
/** `linksFinal` false while module notes are still missing: a link to a note that is not there yet may be written by a later call, so it is checked once the set is complete. */
export function checkContext(files: ReadonlyMap<string, string>, limits: ContextLimits, existing: ReadonlyMap<string, string> = new Map(), linksFinal = true): ContextProblem[] {
  const problems: ContextProblem[] = [];
  const bad = (kind: string, message: string, file?: string): number => problems.push({ kind, message, ...(file === undefined ? {} : { file }) });
  const h1Owner = new Map<string, string>();
  let total = 0;
  for (const [name, text] of [...existing, ...files]) {
    total += tokensOf(text);
    if (!files.has(name)) { const h1 = headings(text, 1)[0]; if (h1 !== undefined) h1Owner.set(h1, name); }
  }
  for (const [name, text] of files) {
    if (!isAllowedPath(name)) { bad('path', 'only overview.md, navigation.md, conventions.md, index.md and modules/<directory path>.md or modules/<directory path>/overview.md (segments of letters, digits, . _ -) are accepted', name); continue; }
    const tokens = tokensOf(text);
    const fileMax = name === INDEX ? limits.maxIndexTokens : limits.maxFileTokens;
    if (tokens > fileMax) bad('file-too-large', `~${tokens} tokens > ${name === INDEX ? 'maxIndexTokens' : 'maxFileTokens'} ${fileMax}`, name);
    if (name === INDEX) checkIndex(text, new Set([...existing.keys(), ...files.keys()]), bad);
    if (text.split('\n').some((line) => FENCE.test(line))) bad('code-fence', 'code fences are not allowed; write a signature as one line in a bullet', name);
    const h1s = headings(text, 1);
    if (h1s.length !== 1) bad('h1', `needs exactly one H1 (the file's purpose), found ${h1s.length}`, name);
    else if (h1Owner.has(h1s[0]!)) bad('duplicate-h1', `H1 "${h1s[0]}" is also the H1 of ${h1Owner.get(h1s[0]!)}`, name);
    else h1Owner.set(h1s[0]!, name);
    if (linksFinal && name.startsWith('modules/')) {
      for (const bullet of sectionOf(text.split('\n'), SUBMODULES).filter((line) => line.startsWith('- '))) {
        const target = path.posix.join(path.posix.dirname(name), bullet.slice(2).split(/\s/)[0]!);
        if (!files.has(target) && !existing.has(target)) bad('submodule-link', `Submodules bullet "${bullet}" does not name a note of the bundle or already written, relative to ${name}`, name);
      }
    }
    const seen = new Set<string>();
    for (const h2 of headings(text, 2)) { if (seen.has(h2)) bad('duplicate-h2', `H2 "${h2}" appears twice`, name); seen.add(h2); }
  }
  const fixed = [...existing.keys(), ...files.keys()];
  if ((fixed.includes('overview.md') || fixed.includes('navigation.md')) && !fixed.includes('conventions.md')) {
    bad('conventions-missing', 'the context has no conventions.md: read the documentation files `context tree` lists that describe how the code is written, and the code, and write it with overview.md and navigation.md');
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

const KEY_FILES = '## Key files';
const FOLDERS = '## Folders';
const SUBMODULES = '## Submodules';
const ROOT_PREFIX = 'Root: ';
const DEPENDS = '## Depends on';
const SECTIONS_AFTER_KEY_FILES = [FOLDERS, SUBMODULES, DEPENDS, '## Gotchas'];
const MAX_NAMES_PER_FILE = 8;
/**
 * A file name (last extension dropped) names a module in another module's text only when it is this long and borne by one module.
 * Measured on a 115-module repository against its real import statements (module level): the first segment of the name
 * ("report" of report.service.ts) gave precision 0.13 to 0.23 because common words matched; the full name with length 5 gave
 * 0.78, 8 gave 0.91 (recall 0.90), 12 gave 0.99 (recall 0.83); uniqueness (2 to 100 owners allowed) changed nothing there.
 */
const MIN_REFERENCE_NAME = 8;
/** The real imports average 8.4 modules per module; a cap of 8 kept recall 0.63 at precision 0.95, 6 gave 0.51 and 4 gave 0.37. */
const MAX_DEPENDS = 8;
/** A bullet names the referenced files of one module: the two most mentioned keep it one line, since a bullet per file would multiply the lines the cap of 8 already bounds. */
const MAX_DEPENDS_FILES = 2;

/** Name (file name without its last extension) to the one module whose own files carry it and the file; names under MIN_REFERENCE_NAME or borne by two modules are left out. */
function referenceOwners(own: ReadonlyMap<string, readonly string[]>): Map<string, { module: string; file: string }> {
  const owners = new Map<string, { module: string; file: string } | null>();
  for (const [module, files] of own) {
    for (const file of files) {
      const name = file.slice(file.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
      if (name.length < MIN_REFERENCE_NAME) continue;
      const seen = owners.get(name);
      owners.set(name, seen === undefined || seen?.module === module ? seen ?? { module, file } : null);
    }
  }
  return new Map([...owners].filter((entry): entry is [string, { module: string; file: string }] => entry[1] !== null));
}

/**
 * One bullet per module, other than this one, its ancestors and its descendants, whose file names the text mentions as a word (letters, digits, `.`, `_`, `-`):
 * the module's most mentioned files (at most MAX_DEPENDS_FILES), comma separated; modules most mentioned first, then by path. Text match, not import syntax, so any language works.
 */
function referencedFiles(modulePath: string, text: string, owners: ReadonlyMap<string, { module: string; file: string }>): string[] {
  const perModule = new Map<string, Map<string, number>>();
  for (const match of text.matchAll(/[A-Za-z0-9_.-]+/g)) {
    const owner = owners.get(match[0]);
    if (owner === undefined || owner.module === modulePath || modulePath.startsWith(`${owner.module}/`) || owner.module.startsWith(`${modulePath}/`)) continue;
    const files = perModule.get(owner.module) ?? new Map<string, number>();
    files.set(owner.file, (files.get(owner.file) ?? 0) + 1);
    perModule.set(owner.module, files);
  }
  const total = (files: Map<string, number>): number => [...files.values()].reduce((sum, n) => sum + n, 0);
  return [...perModule].sort(([a, x], [b, y]) => total(y) - total(x) || (a < b ? -1 : 1)).slice(0, MAX_DEPENDS).map(([, files]) => `- ${[...files].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1)).slice(0, MAX_DEPENDS_FILES).map(([file]) => file).join(', ')}`);
}

/** The note's lines with `## Depends on` holding exactly these bullets: the section is replaced, or placed before `## Gotchas`, or last. Nothing to say leaves the lines as written. */
function withDepends(lines: readonly string[], bullets: readonly string[]): string[] {
  if (bullets.length === 0) return [...lines];
  const at = lines.indexOf(DEPENDS);
  const end = at < 0 ? -1 : lines.findIndex((line, i) => i > at && line.startsWith('## '));
  if (at >= 0) return [...lines.slice(0, at), DEPENDS, ...bullets, ...(end < 0 ? [] : lines.slice(end))];
  const gotchas = lines.indexOf('## Gotchas');
  return gotchas < 0 ? [...lines, DEPENDS, ...bullets] : [...lines.slice(0, gotchas), DEPENDS, ...bullets, ...lines.slice(gotchas)];
}

/** The directory a module note stands for; its files are those no deeper module note claims. */
const moduleDirOf = (note: string): string | null => (note.startsWith('modules/') ? note.slice('modules/'.length).replace(/(\/overview)?\.md$/, '') : null);

/** Module source files by the deepest module directory (as `moduleDirOf` writes it) that contains them. */
function ownedFiles(moduleDirs: ReadonlySet<string>, sourceFiles: readonly string[]): Map<string, string[]> {
  const owned = new Map<string, string[]>();
  for (const file of sourceFiles.filter(isModuleSource)) {
    const parts = file.split('/').slice(0, -1);
    for (let depth = parts.length; depth > 0; depth -= 1) {
      const dir = parts.slice(0, depth).map(safeSegment).join('/');
      if (moduleDirs.has(dir)) { owned.set(dir, [...owned.get(dir) ?? [], file]); break; }
    }
  }
  return owned;
}

const withoutFolders = (lines: string[]): string[] => {
  const at = lines.indexOf(FOLDERS);
  if (at < 0) return lines;
  const end = lines.findIndex((line, i) => i > at && line.startsWith('## '));
  return [...lines.slice(0, at), ...(end < 0 ? [] : lines.slice(end))];
};

const sectionOf = (lines: readonly string[], heading: string): string[] => {
  const at = lines.indexOf(heading);
  if (at < 0) return [];
  const end = lines.findIndex((line, i) => i > at && line.startsWith('## '));
  return lines.slice(at + 1, end < 0 ? undefined : end);
};

/** A Submodules bullet carrying the full `modules/...` note path becomes the path relative to this note's directory, as a markdown link would be. */
const relativeSubmodules = (note: string, text: string): string => {
  let inside = false;
  return text.split('\n').map((line) => {
    if (line.startsWith('## ')) inside = line === SUBMODULES;
    const link = inside ? /^- (modules\/\S+)/.exec(line) : null;
    return link === null ? line : `- ${path.posix.relative(path.posix.dirname(note), link[1]!)}${line.slice(link[0].length)}`;
  }).join('\n');
};

/** `Root: <module dir>` directly under the H1, generated: any line the model wrote is replaced. */
function withRoot(text: string, modulePath: string): string {
  const lines = text.split('\n').filter((line) => !line.startsWith(ROOT_PREFIX));
  const h1 = lines.findIndex((line) => line.startsWith('# '));
  if (h1 >= 0) lines.splice(h1 + 1, 0, `${ROOT_PREFIX}${modulePath}`);
  return lines.join('\n');
}

/** The directories below a module that hold its source files (folded, not modules themselves), one bullet each, sorted by path relative to the module. A model bullet that names the folder and adds `: description` is kept. */
function folderBullets(modulePath: string, files: readonly string[], written: readonly string[]): string[] {
  const byDir = new Map<string, string[]>();
  for (const key of groupByBase(modulePath, files, new Map()).keys()) {
    const slash = key.lastIndexOf('/') + 1;
    if (slash > 0) byDir.set(key.slice(0, slash), [...byDir.get(key.slice(0, slash)) ?? [], key.slice(slash)]);
  }
  return [...byDir].sort(([a], [b]) => (a < b ? -1 : 1)).map(([dir, bases]) => {
    const prefix = [`- ${dir} - `, `- ${modulePath}/${dir} - `].find((head) => written.some((line) => line.startsWith(head) && line.includes(':')));
    if (prefix !== undefined) return `- ${dir} - ${written.find((line) => line.startsWith(prefix) && line.includes(':'))!.slice(prefix.length)}`;
    return `- ${dir} - ${bases.slice(0, MAX_NAMES_PER_FILE).join(', ')}${bases.length > MAX_NAMES_PER_FILE ? `, +${bases.length - MAX_NAMES_PER_FILE}` : ''}`;
  });
}

/** The text of the files, each whole unless over MAX_SNAPSHOT_FILE_BYTES; a file that cannot be read adds nothing. */
async function readSources(fs: FileSystem, root: string, files: readonly string[]): Promise<string> {
  const parts: string[] = [];
  for (const file of files) {
    try {
      const absolute = path.join(root, file);
      if ((await fs.stat(absolute)).size <= MAX_SNAPSHOT_FILE_BYTES) parts.push(await fs.readText(absolute));
    } catch { /* not on disk */ }
  }
  return parts.join('\n');
}

/**
 * Rewrites `## Key files` and `## Folders` of each module note from the declarations of the module's own tracked source files, files
 * with the most declarations first. A bullet the model wrote is kept when it adds a description (`:`) to a path whose
 * declarations include a name it mentions; every other model bullet is replaced. A note may use maxFileTokens but at
 * most NOTE_TOKENS, the size maxModulesFor budgets per note, and all notes together what maxTotalTokens leaves: small
 * notes take what they need, the rest is shared equally. Without the NOTE_TOKENS cap, a write of a few notes gave each
 * the whole remainder (a level-by-level run on 221 modules reached 107.7k at level 5 and failed total-too-large; a
 * 135-module repository overflowed by 9000 tokens when every note took its full maxFileTokens). Files belong to the
 * deepest directory of the module tree (or of a note), not of the notes present: notes are written level by level, so
 * a parent written first would otherwise list its whole subtree (198 files twice on a 904-directory repository).
 * Folders bullets take the note's room before Key files bullets: a folder named once beats a tail of the file list.
 * `## Depends on` is generated too, from the other modules whose file names the module's own files mention (referencedFiles), and takes room after Folders and before the Key files tail: at most 8 short lines, and the dependencies are what a reader cannot get from the module's own files.
 */
async function fillKeyFiles(fs: FileSystem, root: string, bundle: Map<string, string>, others: ReadonlyMap<string, string>, sourceFiles: readonly string[], limits: ContextLimits, tree: TreeResult, indexChars: number): Promise<void> {
  const treePaths = new Map(tree.modules.map((module) => [moduleDirOf(module.note)!, module.path]));
  const owned = ownedFiles(new Set([...[...bundle.keys(), ...others.keys()].map(moduleDirOf).filter((dir): dir is string => dir !== null), ...treePaths.keys()]), sourceFiles);
  const owners = referenceOwners(new Map([...owned].map(([dir, files]) => [treePaths.get(dir) ?? dir, files])));
  const names = new Map<string, string[]>();
  for (const declaration of await harvest(fs, root, [...owned.values()].flat())) {
    const list = names.get(declaration.path) ?? [];
    if (!list.includes(declaration.name)) list.push(declaration.name);
    names.set(declaration.path, list);
  }
  for (const [note, text] of bundle) {
    const dir = moduleDirOf(note);
    if (dir !== null) bundle.set(note, withRoot(relativeSubmodules(note, text), treePaths.get(dir) ?? dir));
  }
  const pending = [];
  for (const [note, text] of bundle) {
    const dir = moduleDirOf(note) ?? '';
    const files = owned.get(dir);
    if (files === undefined) continue;
    const modulePath = treePaths.get(dir) ?? dir;
    const relative = (file: string): string => (file.startsWith(`${modulePath}/`) ? file.slice(modulePath.length + 1) : file);
    const lines = text.split('\n');
    const writtenFolders = sectionOf(lines, FOLDERS);
    const start = lines.indexOf(KEY_FILES);
    const end = start < 0 ? -1 : lines.findIndex((line, i) => i > start && line.startsWith('## '));
    const section = start < 0 ? [] : lines.slice(start + 1, end < 0 ? undefined : end);
    const next = start < 0 ? lines.findIndex((line) => SECTIONS_AFTER_KEY_FILES.includes(line)) : end;
    const before = lines.slice(0, start >= 0 ? start : next < 0 ? lines.length : next).join('\n').trimEnd().split('\n');
    const after = next < 0 ? [] : withoutFolders(lines.slice(next));
    const ranked = files.filter((file) => names.has(file)).sort((a, b) => names.get(b)!.length - names.get(a)!.length || (a < b ? -1 : 1));
    const bullets = ranked.map((file) => {
      const declared = names.get(file)!.slice(0, MAX_NAMES_PER_FILE);
      const head = [`- ${relative(file)} - `, `- ${file} - `].find((prefix) => section.some((line) => line.startsWith(prefix) && line.includes(':') && declared.some((name) => new RegExp(`\\b${name}\\b`).test(line))));
      const kept = head === undefined ? undefined : section.find((line) => line.startsWith(head) && line.includes(':') && declared.some((name) => new RegExp(`\\b${name}\\b`).test(line)))!.slice(head.length);
      return `- ${relative(file)} - ${kept ?? declared.join(', ')}`;
    });
    const folders = folderBullets(modulePath, files, writtenFolders);
    const depends = referencedFiles(modulePath, await readSources(fs, root, files), owners);
    pending.push({ note, before, after, bullets, folders, depends, base: [...before, KEY_FILES, FOLDERS, ...after].join('\n').length + 3 });
  }
  // ceil(len / 4) per file can add one token each, so one token per note is held back.
  const filled = new Set(pending.map((item) => item.note));
  const unfilled = [...others.values(), ...[...bundle].filter(([note]) => !filled.has(note)).map(([, text]) => text)];
  let remaining = (limits.maxTotalTokens - bundle.size - others.size) * 4 - unfilled.reduce((sum, text) => sum + text.length, 0) - pending.reduce((sum, item) => sum + item.base, 0) - indexChars;
  const need = (item: { bullets: string[]; folders: string[]; depends: string[] }): number => [...item.bullets, ...item.folders, ...item.depends].reduce((sum, bullet) => sum + bullet.length + 1, 0);
  pending.sort((a, b) => need(a) - need(b));
  pending.forEach((item, i) => {
    let room = Math.min(Math.min(limits.maxFileTokens, NOTE_TOKENS) * 4 - item.base, Math.floor(remaining / (pending.length - i)));
    const take = (bullets: string[]): string[] => bullets.filter((bullet) => {
      if (bullet.length + 1 > room) return false;
      room -= bullet.length + 1;
      remaining -= bullet.length + 1;
      return true;
    });
    const folders = take(item.folders);
    const depends = take(item.depends);
    const key = take(item.bullets);
    bundle.set(item.note, `${[...item.before, KEY_FILES, ...key, FOLDERS, ...folders, ...withDepends(item.after, depends)].join('\n').trim()}\n`);
  });
}

export async function writeContext(fs: FileSystem, root: string, bundleText: string, limits: ContextLimits, replace: boolean, sourceFiles: readonly string[], roots: readonly string[] = []): Promise<WriteOutcome> {
  const dir = path.join(root, CONTEXT_DIR);
  const parsed = parseBundle(bundleText);
  const onDisk = await readAll(fs, dir);
  const kept = new Map([...onDisk].filter(([name]) => !parsed.has(name) && !replace));
  const tree = buildModuleTree(sourceFiles, { roots, maxModules: maxModulesFor(limits) });
  const build = async (indexChars: number) => {
    const bundle = new Map(parsed);
    await fillKeyFiles(fs, root, bundle, kept, sourceFiles, limits, tree, indexChars);
    const indexed = planIndexOfNotes(tree.modules, new Map([...kept, ...bundle].filter(([name]) => name.startsWith('modules/'))), limits.maxIndexTokens);
    if (indexed.folders > 0) bundle.set(INDEX, indexed.text);
    const notes = new Map([...kept, ...bundle].filter(([name]) => name.startsWith('modules/')));
    const complete = tree.modules.every((module) => notes.has(module.note));
    // A regenerated index replaces the one on disk; counting both made a final write of 107 notes fail at 51348 tokens when the set held 44132.
    const standing = indexed.folders > 0 ? new Map([...kept].filter(([name]) => name !== INDEX)) : kept;
    return { bundle, indexed, problems: checkContext(bundle, limits, standing, complete) };
  };
  let built = await build(0);
  // The index is made after the notes are filled and counts in the total: a 115-note write was rejected at 47351 tokens of 47000 when the notes took the whole budget. The second fill leaves room for the index the first one produced.
  if (built.indexed.folders > 0 && built.problems.some((problem) => problem.kind === 'total-too-large')) built = await build(Math.max(0, built.indexed.text.length - (kept.get(INDEX)?.length ?? 0)));
  const { bundle, problems } = built;
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

/**
 * Deepest levels listed while at most this many lines result; notes below are counted on their ancestor, whose
 * Submodules section names them. 20 lines is ~1.6 KB: the flat listings of the repositories measured were 9-13 notes (0.4-0.6 KB).
 */
const LISTED_LINES = 20;

/** A module's overview.md stands for its directory, so its submodule notes nest under it. */
const stem = (file: ContextFile): string[] => file.path.replace(/^(modules\/.+)\/overview\.md$/, '$1').replace(/\.md$/, '').split('/');
const isInside = (inner: string[], outer: string[]): boolean => inner.length > outer.length && outer.every((segment, i) => inner[i] === segment);

export function renderListing(files: readonly ContextFile[], limits: ContextLimits): string {
  if (files.length === 0) return 'no context: run /ambicode:init';
  const total = files.reduce((sum, file) => sum + file.tokens, 0);
  const ordered = files.map((file) => ({ file, parts: stem(file) })).sort((a, b) => {
    for (let i = 0; i < Math.min(a.parts.length, b.parts.length); i += 1) if (a.parts[i] !== b.parts[i]) return a.parts[i]! < b.parts[i]! ? -1 : 1;
    return a.parts.length - b.parts.length;
  });
  const entries = ordered.map((entry) => ({ ...entry, ancestors: ordered.filter((other) => isInside(entry.parts, other.parts)) }));
  const nested = entries.some((entry) => entry.ancestors.length > 0);
  const depth = Math.max(...entries.map((entry) => entry.ancestors.length)) + 1;
  let levels = 1;
  while (levels < depth && entries.filter((entry) => entry.ancestors.length <= levels).length <= LISTED_LINES) levels += 1;
  const below = new Map<string, number>();
  for (const entry of entries) {
    const anchor = entry.ancestors[levels - 1];
    if (anchor !== undefined) below.set(anchor.file.path, (below.get(anchor.file.path) ?? 0) + 1);
  }
  const lines = entries.filter((entry) => entry.ancestors.length < levels).map((entry) => {
    const more = below.get(entry.file.path);
    return `${nested ? '  '.repeat(entry.ancestors.length) : ''}${CONTEXT_DIR}/${entry.file.path}  ${entry.file.title}  ~${entry.file.tokens} tokens${more === undefined ? '' : `  (+${more} notes below)`}`;
  });
  const hidden = below.size === 0 ? [] : ['notes below are named in the Submodules section of the note above them'];
  return [...lines, ...hidden, `total ~${total} of ${limits.maxTotalTokens} tokens`].join('\n');
}

/** Fewer source files than this and a directory is described by its parent's note. Raised automatically when the module cap is hit. */
const MIN_MODULE_FILES = 3;
/** Tokens the three fixed notes (overview, navigation, conventions) may take of maxTotalTokens: measured 545 on ts-app-medium, 3000 leaves room for a larger repository. */
const FIXED_NOTES_TOKENS = 3000;
/** Tokens per module note: ts-app-medium averages 182; 400 allows a full Key files list (8 names) and a Submodules list. */
const NOTE_TOKENS = 400;

/** Machine-written files and stories/mocks, which companion a component without being it (tests, styles and templates are already out through isTestPath and isSearchable); no shared classifier exists, so only the names the tests exercise. A mock, fixture or stub folder is a companion too: 61 of the Key files of a 137-note context sat in mocks/ folders. */
const GENERATED_PATTERNS: readonly RegExp[] = [/\.(stories|story|mocks?)\.[^/]+$/, /\.min\.[a-z]+$/, /\.generated\.[a-z]+$/, /\.d\.ts$/, /\.pb\.go$/, /_pb2\.py$/, /\.g\.dart$/, /(^|\/)__generated__\//, /(^|\/)(mocks?|__mocks__|fixtures?|__fixtures__|stubs?)\//];

const isModuleSource = (file: string): boolean => isSearchable(file) && !isTestPath(file) && !GENERATED_PATTERNS.some((pattern) => pattern.test(file));

export const maxModulesFor = (limits: ContextLimits): number => Math.max(1, Math.floor((limits.maxTotalTokens - FIXED_NOTES_TOKENS) / NOTE_TOKENS));

export interface TreeModule {
  /** Directory relative to the repository root. */
  path: string;
  depth: number;
  parent: string | null;
  children: string[];
  /** Note path under .ambicode/context/ that mirrors the directory. */
  note: string;
  /** Source files in the module's whole subtree, folded directories included. */
  subtreeFiles: number;
}

interface TreeResult {
  sourceFiles: number;
  minFiles: number;
  maxModules: number;
  /** The cap was still exceeded at the largest fold: only top-level modules remain. */
  overCap: boolean;
  deepestSourceDirectory: number;
  modules: TreeModule[];
}

/** The note path for a module directory; characters the context path rule refuses become `_`. A module with submodules keeps its note inside its folder. */
export const noteOf = (directory: string, hasSubmodules = false): string => `modules/${directory.split('/').map(safeSegment).join('/')}${hasSubmodules ? '/overview' : ''}.md`;

interface Node { path: string; files: number; children: Map<string, Node>; count: number }

function buildDirectoryTree(files: readonly string[]): Node {
  const root: Node = { path: '', files: 0, children: new Map(), count: 0 };
  for (const file of files) {
    let node = root;
    node.count += 1;
    for (const part of file.split('/').slice(0, -1)) {
      let next = node.children.get(part);
      if (next === undefined) { next = { path: node.path === '' ? part : `${node.path}/${part}`, files: 0, children: new Map(), count: 0 }; node.children.set(part, next); }
      node = next;
      node.count += 1;
    }
    node.files += 1;
  }
  return root;
}

function modulesAt(root: Node, min: number): TreeModule[] {
  const out: TreeModule[] = [];
  // A directory is a module when it holds files itself or branches into two directories that do; a chain with neither
  // is skipped, so the deepest directory of the chain carries the note. The repository root is never a module.
  const visit = (node: Node, parent: TreeModule | null): void => {
    const branches = [...node.children.values()].filter((child) => child.count > 0).length;
    const isModule = node.path !== '' && (node.files > 0 || branches >= 2) && (parent === null || node.count >= min);
    let owner = parent;
    if (isModule) {
      owner = { path: node.path, depth: node.path.split('/').length, parent: parent?.path ?? null, children: [], note: noteOf(node.path), subtreeFiles: node.count };
      parent?.children.push(node.path);
      out.push(owner);
    }
    for (const child of [...node.children.values()].sort((a, b) => (a.path < b.path ? -1 : 1))) visit(child, owner);
  };
  visit(root, null);
  for (const module of out) module.note = noteOf(module.path, module.children.length > 0);
  return out;
}

/**
 * Modules of the source files under `roots` ('' or '.' = whole repository), full depth. Directories under `min` files
 * fold into the nearest module above; `min` rises until at most `maxModules` remain.
 */
export function buildModuleTree(allFiles: readonly string[], options: { roots: readonly string[]; maxModules: number; minFiles?: number }): TreeResult {
  const roots = options.roots.map((root) => root.replace(/^\.\/?|\/+$/g, '')).filter((root, i, all) => all.indexOf(root) === i);
  const inRoots = (file: string): boolean => roots.length === 0 || roots.some((root) => root === '' || file.startsWith(`${root}/`));
  const files = allFiles.filter((file) => inRoots(file) && isModuleSource(file)).sort();
  const root = buildDirectoryTree(files);
  let min = options.minFiles ?? MIN_MODULE_FILES;
  let modules = modulesAt(root, min);
  while (modules.length > options.maxModules && min <= files.length) modules = modulesAt(root, ++min);
  const deepest = files.reduce((depth, file) => Math.max(depth, file.split('/').length - 1), 0);
  return { sourceFiles: files.length, minFiles: min, maxModules: options.maxModules, overCap: modules.length > options.maxModules, deepestSourceDirectory: deepest, modules };
}

export function renderTree(result: TreeResult): string {
  const head = `source files ${result.sourceFiles}, modules ${result.modules.length} (cap ${result.maxModules}, directories under ${result.minFiles} files fold into the parent), deepest source directory ${result.deepestSourceDirectory}${result.overCap ? ', OVER CAP' : ''}`;
  const notes = new Map(result.modules.map((module) => [module.path, module.note]));
  const lines = result.modules.map((module) => `${module.note}  dir ${module.path}  depth ${module.depth}  files ${module.subtreeFiles}${module.children.length === 0 ? '' : `  submodules: ${module.children.map((child) => notes.get(child)).join(' ')}`}`);
  return [head, ...lines].join('\n');
}

/** The file name with every suffix after its first dot stripped (`a.b.c.ts` -> `a`, `.eslintrc.js` -> `.eslintrc`). */
export const baseNameOf = (file: string): string => /^\.?[^.]*/.exec(file.slice(file.lastIndexOf('/') + 1))![0];

interface LevelFile { base: string; names: string[] }
interface LevelFolder { module: TreeModule; level: number; files: LevelFile[] }

/** The module's files grouped by path inside the module plus base name, each with the entity names its files declare. */
function groupByBase(modulePath: string, files: readonly string[], names: ReadonlyMap<string, string[]>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const inside = file.slice(modulePath.length + 1);
    const key = `${inside.slice(0, inside.lastIndexOf('/') + 1)}${baseNameOf(inside)}`;
    const list = groups.get(key) ?? [];
    for (const name of names.get(file) ?? []) if (!list.includes(name)) list.push(name);
    groups.set(key, list);
  }
  return groups;
}

/**
 * Every module of the tree with its level, the base names of the files it owns and the entities they declare. A file in a folded
 * directory below the module is keyed with its path inside the module, so a base name is unique per folder. Companions are out
 * through isModuleSource, as in Key files.
 */
export async function allFolders(fs: FileSystem, root: string, result: TreeResult, sourceFiles: readonly string[]): Promise<LevelFolder[]> {
  const byPath = new Map(result.modules.map((module) => [module.path, module]));
  const levelOf = (module: TreeModule): number => (module.parent === null ? 1 : levelOf(byPath.get(module.parent)!) + 1);
  const owned = ownedFiles(new Set(result.modules.map((module) => moduleDirOf(module.note)!)), sourceFiles);
  const names = new Map<string, string[]>();
  for (const declaration of await harvest(fs, root, [...owned.values()].flat())) {
    const list = names.get(declaration.path) ?? [];
    if (!list.includes(declaration.name)) list.push(declaration.name);
    names.set(declaration.path, list);
  }
  return result.modules.map((module) => {
    const groups = groupByBase(module.path, owned.get(moduleDirOf(module.note)!) ?? [], names);
    return { module, level: levelOf(module), files: [...groups].sort(([a], [b]) => (a < b ? -1 : 1)).map(([base, list]) => ({ base, names: list })) };
  });
}

const folderHead = (module: TreeModule, level: number, parent: string | null = null, description = '', names = ''): string =>
  `${'  '.repeat(level - 1)}- [${parent !== null && module.path.startsWith(`${parent}/`) ? module.path.slice(parent.length + 1) : module.path}](${module.note})${description === '' ? '' : ` - ${description}`}${names === '' ? '' : ` | ${names}`}`;

const folderLines = ({ module, level, files }: LevelFolder): string[] => [
  folderHead(module, level),
  ...files.map(({ base, names }) => `${'  '.repeat(level)}- ${base}${names.length === 0 ? '' : `: ${names.slice(0, MAX_NAMES_PER_FILE).join(', ')}${names.length > MAX_NAMES_PER_FILE ? `, +${names.length - MAX_NAMES_PER_FILE}` : ''}`}`),
];

/** One markdown bullet per folder (indented by level, linked to its note) and one per base name below it: the shape index.md uses. */
export function renderLevel(folders: readonly LevelFolder[], level: number): string {
  const lines = folders.flatMap(folderLines);
  return [`level ${level}: ${folders.length} folders, ${folders.reduce((sum, folder) => sum + folder.files.length, 0)} base names`, ...lines].join('\n');
}

interface IndexPlan { text: string; tokens: number; folders: number; shownLevels: number; totalLevels: number }

const DESCRIPTION_WORDS = 12;

/** The first Purpose bullet of a module note, cut at a word boundary to DESCRIPTION_WORDS words; '' when the note or bullet is missing. */
const descriptionOf = (note: string | undefined): string => {
  const bullet = sectionOf((note ?? '').split('\n'), '## Purpose').find((line) => line.startsWith('- '));
  return (bullet ?? '').slice(2).replace(/\s\|\s/g, ' ').trim().split(/\s+/).slice(0, DESCRIPTION_WORDS).join(' ').replace(/[\s.,;:-]+$/, '');
};

/** The names of the Key files bullets, paths dropped: a described bullet `name(args): text` gives `name`. Deduplicated, MAX_NAMES_PER_FILE kept, then `+N`. */
const keyNamesOf = (note: string | undefined): string => {
  const names = new Set<string>();
  for (const bullet of sectionOf((note ?? '').split('\n'), KEY_FILES).filter((line) => line.startsWith('- '))) {
    const at = bullet.indexOf(' - ', 2);
    if (at < 0) continue;
    const rest = bullet.slice(at + 3);
    const colon = rest.indexOf(':');
    for (const name of colon < 0 ? rest.split(', ') : [rest.slice(0, colon).replace(/\(.*$/, '')]) if (name.trim() !== '') names.add(name.trim());
  }
  const all = [...names];
  return `${all.slice(0, MAX_NAMES_PER_FILE).join(', ')}${all.length > MAX_NAMES_PER_FILE ? `, +${all.length - MAX_NAMES_PER_FILE}` : ''}`;
};

/**
 * Every module folder as one linked line with its description and the names of its Key files, parents before children. Whole levels are added, shallowest
 * first, while the text fits `maxTokens`; the first level always stays. Deeper folders are reached through the parent
 * note's Submodules section.
 */
export function planIndex(modules: readonly TreeModule[], notes: ReadonlyMap<string, string>, maxTokens: number): IndexPlan {
  const byPath = new Map(modules.map((module) => [module.path, module]));
  const levelOf = (module: TreeModule): number => (module.parent === null ? 1 : levelOf(byPath.get(module.parent)!) + 1);
  const totalLevels = modules.reduce((deepest, module) => Math.max(deepest, levelOf(module)), 0);
  const render = (levels: number): { text: string; folders: number } => {
    const lines: string[] = [];
    const walk = (module: TreeModule): void => {
      const level = levelOf(module);
      if (level > levels) return;
      lines.push(folderHead(module, level, module.parent, descriptionOf(notes.get(module.note)), keyNamesOf(notes.get(module.note))));
      for (const child of [...module.children].sort()) walk(byPath.get(child)!);
    };
    for (const module of modules.filter((candidate) => candidate.parent === null)) walk(module);
    return { text: `# Index\n${lines.join('\n')}\n`, folders: lines.length };
  };
  let shownLevels = Math.min(1, totalLevels);
  while (shownLevels < totalLevels && tokensOf(render(shownLevels + 1).text) <= maxTokens) shownLevels += 1;
  const { text, folders } = render(shownLevels);
  return { text, tokens: tokensOf(text), folders, shownLevels, totalLevels };
}

/** Roots as the tree matches them: relative to the repository. A model may pass an absolute path; one outside the repository is an error. */
export function repoRelativeRoots(repositoryRoot: string, roots: readonly string[]): string[] {
  return roots.map((given) => {
    const relative = path.relative(repositoryRoot, path.resolve(repositoryRoot, given));
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new AmbicodeError('bad-argument', `--root ${given} is outside the repository`, { field: 'root' });
    return relative.split(path.sep).join('/');
  });
}

/** The index of the modules that have a note; a module whose ancestor has none is left out, so every link names a written note. */
export function planIndexOfNotes(modules: readonly TreeModule[], notes: ReadonlyMap<string, string>, maxTokens: number): IndexPlan {
  const byPath = new Map(modules.map((module) => [module.path, module]));
  const linked = (module: TreeModule): boolean => notes.has(module.note) && (module.parent === null || linked(byPath.get(module.parent)!));
  const kept = modules.filter(linked);
  const keptPaths = new Set(kept.map((module) => module.path));
  return planIndex(kept.map((module) => ({ ...module, children: module.children.filter((child) => keptPaths.has(child)) })), notes, maxTokens);
}

const PROSE_FILE = /\.(md|mdx|markdown|rst|adoc|asciidoc|org|txt)$/i;
/** 15 lines is ~1 KB of tree output; past that the list stops telling the scout which doc is worth a read. Shallowest, then largest, are kept. */
const MAX_PROSE_FILES = 15;

interface ProseFile { path: string; bytes: number }

/** Documentation by type, wherever it sits: tracked markup and plain-text files that are not tests or generated, with their sizes. */
export async function proseFiles(fs: FileSystem, root: string, files: readonly string[]): Promise<ProseFile[]> {
  const found: ProseFile[] = [];
  for (const file of files.filter((candidate) => PROSE_FILE.test(candidate) && !isTestPath(candidate) && !GENERATED_PATTERNS.some((pattern) => pattern.test(candidate)))) {
    const stats = await fs.stat(path.join(root, file)).catch(() => null);
    if (stats !== null && stats.isFile()) found.push({ path: file, bytes: stats.size });
  }
  const depth = (file: ProseFile): number => file.path.split('/').length;
  return found.sort((a, b) => depth(a) - depth(b) || b.bytes - a.bytes || (a.path < b.path ? -1 : 1)).slice(0, MAX_PROSE_FILES);
}

/** The module list, the guidance docs as a plain fact, then every level with its file lines: all a scout needs from one call. */
export function renderFullTree(result: TreeResult, folders: readonly LevelFolder[], docs: readonly ProseFile[]): string {
  const levels = [...new Set(folders.map((folder) => folder.level))].sort((a, b) => a - b);
  return [renderTree(result), ...(docs.length === 0 ? [] : [`documentation files (path, bytes): ${docs.map((doc) => `${doc.path} ${doc.bytes}`).join(', ')}`]), ...levels.map((level) => renderLevel(folders.filter((folder) => folder.level === level), level))].join('\n');
}
