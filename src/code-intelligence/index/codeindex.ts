import path from 'node:path';
import type { Runtime } from '../../composition/root.ts';
import { INDEX_DIR, INDEX_DRIFT_FILES } from '../../config/defaults.ts';
import type { AmbicodeConfig, ProjectConfig } from '../../contracts/config.ts';
import { literalPathspec, type Git } from '../../git/git.ts';
import type { ProcessOutcome } from '../../ports/process.ts';
import { AmbicodeError } from '../../util/errors.ts';
import { contentHash } from '../../util/hash.ts';
import { toPosix } from '../../util/glob.ts';
import { normalizeRelative } from '../../util/paths.ts';
import { profileOf } from '../profile.ts';
import { indexAdapterFor, indexStatus, type IndexAdapter, type IndexAnswer, type IndexReference, type IndexStatus } from './adapter.ts';

export interface IndexDeps {
  runtime: Runtime;
  git: Git;
  repositoryRoot: string;
  config: AmbicodeConfig;
  /** Production: `[process.execPath, process.argv[1]]`; the hook and the CLI are the same script. */
  selfArgv: readonly string[];
  /** Set only by the offline recall script. */
  indexDir?: string;
  isAlive?: (pid: number) => boolean;
}

/** Checked against the codeindex 2.31 README "Use as a CLI"; `refs` takes one symbol, so it runs once per name. File arguments are relative to `--repo .`, the project root. */
export const CODEINDEX_ARGV = {
  build: (dir: string) => ['index', '--repo', '.', '--out', dir],
  find: (dir: string, name: string) => ['find', name, '--repo', '.', '--index', dir],
  refs: (dir: string, name: string) => ['refs', name, '--repo', '.', '--index', dir],
  relates: (dir: string, file: string) => ['impact', file, '--repo', '.', '--index', dir],
};

const QUERY_TIMEOUT_MS = 10_000;
const BUILD_TIMEOUT_MS = 600_000;
const QUERY_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const YOUNG_BUILD_MS = 60_000;
const MARKER = 'ambicode-index.json';
const BUILDING = 'building.json';
/** Above this many uncommitted files at build time the indexed contents are not recorded, and the index counts as stale. */
const MAX_DIRTY_FILES = 1000;

const processAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
};

const oneLine = (text: string, limit: number): string => text.replace(/\s+/g, ' ').trim().slice(0, limit);
const lastLine = (text: string): string => text.trim().split(/\r?\n/).pop() ?? '';

/** `node_modules/.bin` of the repository, then the first `PATH` entry holding the binary (05-A3). */
async function resolveBinary(deps: IndexDeps): Promise<string | null> {
  const names = process.platform === 'win32' ? ['codeindex.cmd', 'codeindex'] : ['codeindex'];
  const directories = [path.join(deps.repositoryRoot, 'node_modules', '.bin'), ...(deps.runtime.env['PATH'] ?? '').split(path.delimiter).filter((entry) => entry !== '')];
  for (const directory of directories) {
    for (const name of names) {
      try {
        if (await deps.runtime.fs.isExecutable(path.join(directory, name))) return path.join(directory, name);
      } catch {
        // Not here.
      }
    }
  }
  return null;
}

type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
/** The whole value, or one key of it, when that is a list; the keys are the observed codeindex 2.31.4 shapes (05-A6). */
const listOf = (value: unknown, key?: string): unknown[] | null => {
  const list = key === undefined ? value : isRow(value) ? value[key] : undefined;
  return Array.isArray(list) ? list : null;
};
const numberOf = (value: unknown): number | null => (typeof value === 'number' ? value : null);
const textOf = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export function codeindexAdapter(deps: IndexDeps, project: ProjectConfig): IndexAdapter {
  const indexDir = deps.indexDir ?? path.join(deps.repositoryRoot, INDEX_DIR);
  const projectRoot = normalizeRelative(project.root);
  const cwd = projectRoot === '' ? deps.repositoryRoot : path.join(deps.repositoryRoot, projectRoot);
  const isAlive = deps.isAlive ?? processAlive;
  const fs = deps.runtime.fs;
  let known: Promise<IndexStatus> | null = null;

  const repositoryPath = (value: unknown): string | null => {
    if (typeof value !== 'string' || value === '') return null;
    const posix = toPosix(value);
    return path.isAbsolute(value) ? normalizeRelative(path.relative(deps.repositoryRoot, value)) : normalizeRelative(path.posix.join(projectRoot, posix));
  };
  const projectPath = (file: string): string => (projectRoot === '' ? file : path.posix.relative(projectRoot, file));
  const inProject = (file: string): boolean => projectRoot === '' || file.startsWith(`${projectRoot}/`);

  /** The binary, or the error status for its absence or for a project init measured as holding no indexable file (05-A8). */
  async function prerequisites(): Promise<{ binary: string } | { status: IndexStatus }> {
    const binary = await resolveBinary(deps);
    if (binary === null) return { status: indexStatus('codeindex', 'error', null, 'codeindex not found (node_modules/.bin or PATH)') };
    if (profileOf(project).index?.files === 0) return { status: indexStatus('codeindex', 'error', null, 'codeindex indexes no file of this project') };
    return { binary };
  }

  async function readJson(file: string): Promise<Record<string, unknown> | null> {
    try {
      return JSON.parse(await fs.readText(path.join(indexDir, file))) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /** Project files whose working-tree contents differ from `head`, untracked ones included. */
  async function changedSince(head: string): Promise<string[]> {
    const changes = await deps.git.rawDiff([head, ...(projectRoot === '' ? [] : ['--', literalPathspec(projectRoot)])]);
    const tracked = changes.flatMap((change) => [change.oldPath, change.newPath]).filter((file): file is string => file !== null);
    return [...new Set([...tracked, ...(await deps.git.untrackedFiles()).filter(inProject)])];
  }
  const hashOf = (file: string): Promise<string | null> => fs.readBytes(path.join(deps.repositoryRoot, file)).then(contentHash, () => null);

  /**
   * Project files whose contents differ from what the build indexed: the commit plus the uncommitted contents the
   * marker recorded (`dirty`: path → hash, null = deleted). Null when the commit is gone or `dirty` was not recorded.
   */
  async function driftOf(marker: Record<string, unknown>): Promise<number | null> {
    const head = marker['head'];
    if (typeof head !== 'string' || (await deps.git.revParse(head)) === null) return null;
    const dirty = marker['dirty'] === undefined ? {} : marker['dirty'];
    if (!isRow(dirty)) return null;
    const changed = new Set(await changedSince(head));
    let drift = 0;
    for (const file of new Set([...changed, ...Object.keys(dirty)])) {
      // Indexed at the commit but changed now, or indexed uncommitted but back at the commit now.
      if (!(file in dirty) || !changed.has(file)) drift += 1;
      else if ((await hashOf(file)) !== dirty[file]) drift += 1;
    }
    return drift;
  }

  async function computeStatus(): Promise<IndexStatus> {
    const ready = await prerequisites();
    if ('status' in ready) return ready.status;
    const building = await readJson(BUILDING);
    if (building !== null) {
      const pid = typeof building['pid'] === 'number' ? building['pid'] : null;
      const startedAt = Date.parse(String(building['startedAt']));
      if (pid !== null ? isAlive(pid) : deps.runtime.clock.now().getTime() - startedAt < YOUNG_BUILD_MS) return indexStatus('codeindex', 'building');
    }
    const marker = await readJson(MARKER);
    if (marker === null) return indexStatus('codeindex', 'absent');
    const drift = await driftOf(marker);
    const fresh = drift !== null && drift <= (deps.config.search.indexDriftFiles ?? INDEX_DRIFT_FILES);
    return indexStatus('codeindex', fresh ? 'fresh' : 'stale', numberOf(marker['builtMs']), null, drift);
  }
  const status = (): Promise<IndexStatus> => (known ??= computeStatus());

  async function run(binary: string, argv: readonly string[], timeoutMs: number): Promise<ProcessOutcome> {
    return deps.runtime.runner.run({ argv: [binary, ...argv], cwd, timeoutMs, maxOutputBytes: QUERY_MAX_OUTPUT_BYTES, env: { kind: 'inherited' } });
  }

  /** Never throws: a failed query is an error status the caller falls back from (05-A6, 05-A7). */
  async function query<T>(argvs: readonly (readonly string[])[], read: (parsed: unknown[]) => T | null): Promise<IndexAnswer<T>> {
    const current = await status();
    if (current.state !== 'fresh' && current.state !== 'stale') return { ok: false, status: current };
    const binary = await resolveBinary(deps);
    const failed = (reason: string): IndexAnswer<T> => ({ ok: false, status: { ...current, state: 'error', fresh: false, reason: oneLine(reason, 200) } });
    if (binary === null) return failed('codeindex not found (node_modules/.bin or PATH)');
    const parsed: unknown[] = [];
    for (const argv of argvs) {
      const outcome = await run(binary, argv, QUERY_TIMEOUT_MS);
      if (outcome.kind === 'timed-out') return failed(`codeindex ${argv[0]} timed out after ${QUERY_TIMEOUT_MS} ms`);
      if (outcome.kind !== 'exited') return failed(`codeindex ${argv[0]} did not start: ${outcome.failure ?? 'unknown'}`);
      if (outcome.exitCode !== 0) return failed(`codeindex ${argv[0]} exited ${String(outcome.exitCode)}: ${lastLine(outcome.stderr)}`);
      try {
        parsed.push(JSON.parse(outcome.stdout) as unknown);
      } catch {
        return failed(`codeindex ${argv[0]} printed output that is not JSON`);
      }
    }
    const value = read(parsed);
    return value === null ? failed('codeindex output has no result list') : { ok: true, value, status: current };
  }

  const paths = (values: readonly unknown[]): string[] => [...new Set(values.map(repositoryPath).filter((file): file is string => file !== null))];

  return {
    name: 'codeindex',
    status: async () => status(),
    async build(_project, options) {
      known = null;
      const ready = await prerequisites();
      if ('status' in ready) return ready.status;
      await fs.mkdirp(indexDir);
      if (options.detached) {
        await fs.writeText(path.join(indexDir, BUILDING), JSON.stringify({ pid: null, startedAt: deps.runtime.clock.now().toISOString() }));
        const spawned = await deps.runtime.runner.run({ argv: [...deps.selfArgv, 'index', 'build', '--project', project.id], cwd: deps.repositoryRoot, timeoutMs: 0, maxOutputBytes: 0, env: { kind: 'inherited' }, output: 'detached' });
        if (spawned.kind === 'detached') return indexStatus('codeindex', 'building');
        await fs.remove(path.join(indexDir, BUILDING));
        return indexStatus('codeindex', 'error', null, oneLine(`index build did not start: ${spawned.failure ?? spawned.kind}`, 200));
      }
      await fs.writeText(path.join(indexDir, BUILDING), JSON.stringify({ pid: process.pid, startedAt: deps.runtime.clock.now().toISOString() }));
      const started = deps.runtime.clock.elapsed();
      const outcome = await run(ready.binary, CODEINDEX_ARGV.build(indexDir), BUILD_TIMEOUT_MS);
      const builtMs = Math.max(0, Math.round(deps.runtime.clock.elapsed() - started));
      await fs.remove(path.join(indexDir, BUILDING));
      if (outcome.kind !== 'exited' || outcome.exitCode !== 0) {
        const how = outcome.kind === 'timed-out' ? `timed out after ${BUILD_TIMEOUT_MS} ms` : outcome.kind === 'exited' ? `exited ${String(outcome.exitCode)}` : `did not start: ${outcome.failure ?? 'unknown'}`;
        throw new AmbicodeError('index-build-failed', `codeindex index ${how}.`, { details: [oneLine(lastLine(outcome.stderr), 300)].filter((line) => line !== '') });
      }
      const head = await deps.git.revParse('HEAD');
      const changed = head === null ? [] : await changedSince(head);
      const dirty = changed.length > MAX_DIRTY_FILES ? null : Object.fromEntries(await Promise.all(changed.map(async (file) => [file, await hashOf(file)])));
      await fs.writeText(path.join(indexDir, MARKER), `${JSON.stringify({ tool: 'codeindex', head, builtAt: deps.runtime.clock.now().toISOString(), builtMs, dirty })}\n`);
      known = null;
      return status();
    },
    // `find`: a list of {name, kind, file, line}.
    find: (name, options) =>
      query([CODEINDEX_ARGV.find(indexDir, name)], ([parsed]) => {
        const rows = listOf(parsed);
        if (rows === null) return null;
        const declarations = rows.filter(isRow).flatMap((row) => {
          const file = repositoryPath(row['file']);
          return file === null ? [] : [{ name: textOf(row['name']) ?? name, path: file, line: numberOf(row['line']), kind: textOf(row['kind']) }];
        });
        return options?.kind === undefined ? declarations : declarations.filter((row) => row.kind === null || row.kind.toLowerCase() === options.kind!.toLowerCase());
      }),
    // `refs`: {callSites: [{file, line}], referencingFiles: [path]}; a file with no call site is listed without a line.
    refs: (names) =>
      query(names.map((name) => CODEINDEX_ARGV.refs(indexDir, name)), (parsed) => {
        const references: IndexReference[] = [];
        for (const value of parsed) {
          const sites = listOf(value, 'callSites');
          const files = listOf(value, 'referencingFiles');
          if (sites === null && files === null) return null;
          const lines = (sites ?? []).filter(isRow).flatMap((row) => {
            const file = repositoryPath(row['file']);
            return file === null ? [] : [{ path: file, line: numberOf(row['line']) }];
          });
          const seen = new Set(lines.map((row) => row.path));
          references.push(...lines, ...paths(files ?? []).filter((file) => !seen.has(file)).map((file) => ({ path: file, line: null })));
        }
        return references;
      }),
    // `impact`: dependents under {files: [{rel, depth}]}, relative to the project; depth ≤ 1 are importers (no depth: not one), and it lists no imports.
    relates: (file) =>
      query([CODEINDEX_ARGV.relates(indexDir, projectPath(file))], ([parsed]) => {
        const rows = listOf(parsed, 'files');
        if (rows === null) return null;
        const direct = rows.filter(isRow).filter((row) => (numberOf(row['depth']) ?? Infinity) <= 1);
        return { imports: null, importers: paths(direct.map((row) => row['rel'])).filter((other) => other !== file) };
      }),
    delta: async () => {
      const current = await status();
      return { ok: false, status: { ...current, state: 'error', fresh: false, reason: 'delta is not read before step 08' } };
    },
  };
}

/** `index build`: refuses before creating anything when the binary, a grammar or the ignore line is missing (05-B1, 05-B2). */
export async function runIndexBuild(deps: IndexDeps, project: ProjectConfig): Promise<IndexStatus> {
  const adapter = indexAdapterFor(deps, project);
  if (adapter.name === 'none') return adapter.status(project);
  const current = await adapter.status(project);
  if (current.state === 'error') throw new AmbicodeError('index-unavailable', `The index cannot be built: ${current.reason ?? 'unknown'}.`, { details: ['Install codeindex in the project or on PATH, or set search.index: none.'] });
  if (deps.indexDir === undefined && !(await deps.git.isIgnored(`${INDEX_DIR}/`))) {
    throw new AmbicodeError('index-not-ignored', `${INDEX_DIR}/ is not ignored by git.`, { details: [`Add ${INDEX_DIR}/ to .gitignore; init --apply writes it on acceptance.`] });
  }
  return adapter.build(project, { detached: false });
}

async function start(deps: IndexDeps, project: ProjectConfig, skipFresh: boolean): Promise<IndexStatus> {
  const adapter = indexAdapterFor(deps, project);
  const current = await adapter.status(project);
  if (adapter.name === 'none' || current.state === 'building' || current.state === 'error' || (skipFresh && current.state === 'fresh')) return current;
  if (deps.indexDir === undefined && !(await deps.git.isIgnored(`${INDEX_DIR}/`))) return indexStatus('codeindex', 'error', null, `${INDEX_DIR}/ is not ignored by git`);
  return adapter.build(project, { detached: true });
}

/** Called at route start; spawns a detached `index build` and never waits for it (05-B4). */
export const startIndexBuild = (deps: IndexDeps, project: ProjectConfig): Promise<IndexStatus> => start(deps, project, true);

/** `startIndexBuild` without the fresh skip, for warm rebuilds (05-B5). */
export const refreshIndex = (deps: IndexDeps, project: ProjectConfig): Promise<IndexStatus> => start(deps, project, false);

export const indexDepsOf = (runtime: Runtime, git: Git, repositoryRoot: string, config: AmbicodeConfig): IndexDeps => ({
  runtime,
  git,
  repositoryRoot,
  config,
  selfArgv: [process.execPath, process.argv[1] ?? ''],
});
