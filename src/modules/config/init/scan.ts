import path from 'node:path';
import { isSeq, parseDocument } from 'yaml';
import { builtinPoliciesDirectory } from '#util/plugin-root';
import type { Runtime } from '#types/composition';
import type { FileSystem } from '#types/platform/ports';
import { detectRuleSources } from './init.ts';

const SKIPPED = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', '.venv', 'venv', '__pycache__', '.ambicode']);
const MANIFEST = /^(package\.json|pyproject\.toml|setup\.py|requirements.*\.txt|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|Gemfile|composer\.json|.+\.(csproj|sln))$/;
const LOCKFILE = /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|poetry\.lock|uv\.lock|Pipfile\.lock|Cargo\.lock|go\.sum|Gemfile\.lock|composer\.lock)$/;
const TOOLS = ['prettier', 'eslint', 'vitest', 'jest', 'playwright', 'tsc', 'black', 'ruff', 'pytest', 'mypy'];
const MAX_DEPTH = 3;
/** The model reads this whole text before it writes a proposal; 2 KiB keeps the step's cost flat on a large monorepo. */
export const MAX_SCAN_BYTES = 2048;

const cut = (text: string, bytes: number): string => (Buffer.byteLength(text) <= bytes ? text : `${Buffer.from(text).subarray(0, bytes - 4).toString('utf8').replace(/�$/, '')} ...`);

/** Whether `argv0` starts something: a path that exists, or a name on PATH or in a node_modules/.bin from the project up to the repository root. */
export async function isRunnable(runtime: Runtime, repositoryRoot: string, projectRoot: string, argv0: string): Promise<boolean> {
  if (argv0.includes('/') || argv0.includes('\\')) return runtime.fs.exists(path.resolve(repositoryRoot, projectRoot, argv0));
  const directories = [...(runtime.env['PATH'] ?? '').split(path.delimiter).filter((entry) => entry !== ''), path.join(repositoryRoot, projectRoot, 'node_modules', '.bin'), path.join(repositoryRoot, 'node_modules', '.bin')];
  for (const directory of directories) {
    for (const suffix of ['', '.cmd', '.exe']) if (await runtime.fs.isExecutable(path.join(directory, argv0 + suffix)).catch(() => false)) return true;
  }
  return false;
}

async function walk(fs: FileSystem, root: string, relative: string, depth: number, found: string[]): Promise<void> {
  const entries = await fs.readdir(path.join(root, relative)).catch(() => []);
  for (const entry of entries) {
    const name = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isFile()) found.push(name);
    else if (entry.isDirectory() && depth < MAX_DEPTH && !SKIPPED.has(entry.name)) await walk(fs, root, name, depth + 1, found);
  }
}

export async function builtinPackIds(runtime: Runtime): Promise<string[]> {
  const entries = await runtime.fs.readdir(builtinPoliciesDirectory(runtime.pluginRoot)).catch(() => []);
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.yaml')).map((entry) => `builtin/${entry.name.replace(/\.yaml$/, '')}`).sort();
}

/** `name (dir, dir, +N)` per file name, so one kind of manifest repeated across a monorepo cannot push the other kinds out of the cap. */
function grouped(files: readonly string[]): string {
  const byName = new Map<string, string[]>();
  for (const file of files) byName.set(path.basename(file), [...(byName.get(path.basename(file)) ?? []), path.dirname(file)]);
  return [...byName].map(([name, dirs]) => `${name} (${dirs.slice(0, 4).map((dir) => (dir === '.' ? '/' : dir)).join(', ')}${dirs.length > 4 ? `, +${dirs.length - 4}` : ''})`).join('; ') || 'none';
}

/** `id: first two appliesTo globs`: the packs carry no summary field, and the scope is what picks a pack for a project; a full list overflowed the cap at 12 packs. */
const builtinPacks = async (runtime: Runtime): Promise<string[]> => {
  const directory = builtinPoliciesDirectory(runtime.pluginRoot);
  const lines: string[] = [];
  for (const id of await builtinPackIds(runtime)) {
    const document = parseDocument(await runtime.fs.readText(path.join(directory, `${id.slice('builtin/'.length)}.yaml`)).catch(() => ''));
    const applies = document.get('appliesTo');
    lines.push(`${id}: ${isSeq(applies) ? applies.toJSON().slice(0, 2).join(',') : '?'}`);
  }
  return lines;
};

/** What the model needs to judge the repository, in at most `MAX_SCAN_BYTES`; reads only, writes nothing. */
export async function scanRepository(runtime: Runtime, repositoryRoot: string, state: { raw: string | null; parses: boolean }): Promise<string> {
  const files: string[] = [];
  await walk(runtime.fs, repositoryRoot, '', 0, files);
  const byDepth = (a: string, b: string): number => a.split('/').length - b.split('/').length || (a < b ? -1 : 1);
  const manifests = files.filter((file) => MANIFEST.test(path.basename(file))).sort(byDepth);
  const scripts: string[] = [];
  for (const file of manifests.filter((candidate) => path.basename(candidate) === 'package.json')) {
    try {
      const block = (JSON.parse(await runtime.fs.readText(path.join(repositoryRoot, file))) as { scripts?: unknown }).scripts;
      if (block !== undefined) scripts.push(`${file}: ${JSON.stringify(block).slice(0, 160)}`);
    } catch {
      scripts.push(`${file}: unreadable`);
    }
  }
  const tools: string[] = [];
  for (const tool of TOOLS) if (await isRunnable(runtime, repositoryRoot, '', tool)) tools.push(tool);
  const rules = await detectRuleSources(runtime.fs, repositoryRoot);
  return [
    cut(`manifests: ${grouped(manifests)}`, 350),
    cut(`lockfiles: ${grouped(files.filter((file) => LOCKFILE.test(path.basename(file))).sort(byDepth))}`, 120),
    cut(`scripts:\n${scripts.join('\n') || 'none'}`, 560),
    cut(`tools on PATH or in node_modules/.bin: ${tools.join(', ') || 'none'}`, 110),
    cut(`packs:\n${(await builtinPacks(runtime)).join('\n')}`, 700),
    cut(`rule sources: ${rules.join(', ') || 'none'}`, 90),
    `config: ${state.raw === null ? 'absent' : state.parses ? 'parsable' : 'unparsable'}`,
  ].join('\n');
}
