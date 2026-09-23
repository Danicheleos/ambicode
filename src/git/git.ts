import type { ProcessRunner } from '../ports/process.ts';
import { AmbicodeError } from '../util/errors.ts';

/**
 * Every git invocation goes through here with external diff drivers and
 * textconv filters disabled, so a repository's own configuration cannot change
 * what AMBICODE reads or run a program of its choosing (doc 02).
 */
const SAFE_CONFIG = [
  '-c', 'core.quotepath=false',
  '-c', 'diff.external=',
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'core.fsmonitor=false',
];

const GIT_TIMEOUT_MS = 60_000;
const GIT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export interface GitOptions {
  runner: ProcessRunner;
  repositoryRoot: string;
  /** Overrides for the fetch store used by remote snapshots. */
  gitDir?: string;
  /** Extra environment, used to point git at a throwaway index file. */
  extraEnv?: Record<string, string>;
}

export class Git {
  readonly options: GitOptions;

  constructor(options: GitOptions) {
    this.options = options;
  }

  private async exec(args: readonly string[], allowFailure = false): Promise<string> {
    return (await this.execOutcome(args, allowFailure)).stdout;
  }

  /**
   * The same invocation, keeping the exit code. Only a caller for which a
   * nonzero status is an *answer* rather than a failure needs it: `git grep`
   * exits 1 to say "no file matched", which is a fact, while anything above 1
   * is a real error that must not be read as an empty result (R4).
   */
  private async execOutcome(
    args: readonly string[],
    allowFailure = false,
  ): Promise<{ stdout: string; exitCode: number | null }> {
    const prefix = this.options.gitDir === undefined ? [] : ['--git-dir', this.options.gitDir];
    const outcome = await this.options.runner.run({
      argv: ['git', ...prefix, ...SAFE_CONFIG, ...args],
      cwd: this.options.repositoryRoot,
      timeoutMs: GIT_TIMEOUT_MS,
      maxOutputBytes: GIT_MAX_OUTPUT_BYTES,
      // Git reads the operator's own configuration, credential helpers and
      // ssh agent, so it runs with the inherited environment plus narrow
      // overrides (doc 02). The reviewer's policy is a different one.
      env: {
        kind: 'inherited',
        overrides: {
          GIT_OPTIONAL_LOCKS: '0',
          GIT_TERMINAL_PROMPT: '0',
          // git is translated. Pin the locale so diagnostics AMBICODE surfaces
          // to the user are the messages this codebase was written against.
          LC_ALL: 'C',
          LANG: 'C',
          ...this.options.extraEnv,
        },
      },
    });

    if (outcome.kind === 'spawn-failed') {
      throw new AmbicodeError('git-unavailable', 'git could not be started.', {
        details: [outcome.failure ?? 'unknown spawn failure'],
      });
    }
    if (outcome.kind === 'timed-out') {
      throw new AmbicodeError('git-timeout', `git ${args[0] ?? ''} timed out.`);
    }
    if (outcome.exitCode !== 0 && !allowFailure) {
      throw new AmbicodeError('git-failed', `git ${args[0] ?? ''} failed with exit code ${outcome.exitCode}.`, {
        details: [outcome.stderr.trim()].filter((line) => line !== ''),
      });
    }
    if (outcome.truncated) {
      throw new AmbicodeError('git-output-truncated', `git ${args[0] ?? ''} produced more output than AMBICODE reads.`);
    }
    return { stdout: outcome.stdout, exitCode: outcome.exitCode };
  }

  /**
   * A view of the same repository that writes index changes to `indexFile`
   * instead of `.git/index`, so inspecting the working tree cannot alter the
   * developer's staged state (doc 02, "Preserve index bytes").
   */
  withIndexFile(indexFile: string): Git {
    return new Git({ ...this.options, extraEnv: { ...this.options.extraEnv, GIT_INDEX_FILE: indexFile } });
  }

  /** Marks untracked, non-ignored files as intent-to-add in the current index. */
  async markIntentToAdd(): Promise<void> {
    await this.exec(['add', '--intent-to-add', '--', '.'], true);
  }

  async gitCommonDir(): Promise<string> {
    return (await this.exec(['rev-parse', '--path-format=absolute', '--git-dir'])).trim();
  }

  async isDirty(): Promise<boolean> {
    return (await this.status()).trim() !== '';
  }

  /**
   * Porcelain status including untracked files, used to notice that a command
   * created, removed, or staged something while it ran.
   */
  async status(): Promise<string> {
    return await this.exec(['status', '--porcelain', '-z', '--untracked-files=all'], true);
  }

  async isRepository(): Promise<boolean> {
    const output = await this.exec(['rev-parse', '--is-inside-work-tree'], true);
    return output.trim() === 'true';
  }

  async topLevel(): Promise<string> {
    return (await this.exec(['rev-parse', '--show-toplevel'])).trim();
  }

  async hasHead(): Promise<boolean> {
    const output = await this.exec(['rev-parse', '--verify', '--quiet', 'HEAD'], true);
    return output.trim() !== '';
  }

  async revParse(ref: string): Promise<string | null> {
    // `--` separates the revision from any path with the same name.
    const output = await this.exec(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], true);
    const sha = output.trim();
    return sha === '' ? null : sha;
  }

  async mergeBase(a: string, b: string): Promise<string | null> {
    const output = await this.exec(['merge-base', a, b], true);
    const sha = output.trim();
    return sha === '' ? null : sha;
  }

  async originHead(): Promise<string | null> {
    const output = await this.exec(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], true);
    const ref = output.trim();
    if (ref === '') return null;
    return ref.replace(/^refs\/remotes\//, '');
  }

  /** Paths git reports as unmerged. A non-empty list blocks working review. */
  async unmergedPaths(): Promise<string[]> {
    // `ls-files --unmerged` reads the index directly, so it reports a conflict
    // whether or not the working files have been touched since.
    const output = await this.exec(['ls-files', '--unmerged', '-z'], true);
    const paths = new Set<string>();
    for (const record of splitNul(output)) {
      const path = record.split('\t').slice(1).join('\t');
      if (path !== '') paths.add(path);
    }
    return [...paths];
  }

  async untrackedFiles(): Promise<string[]> {
    const output = await this.exec(['ls-files', '--others', '--exclude-standard', '-z']);
    return splitNul(output);
  }

  /** `--raw -z`: the authoritative change list, free of path-quoting ambiguity. */
  async rawDiff(args: readonly string[]): Promise<RawChange[]> {
    const output = await this.exec(['diff', '--no-ext-diff', '--no-textconv', '-M', '--raw', '-z', ...args]);
    return parseRawZ(output);
  }

  async patchDiff(args: readonly string[], contextLines: number): Promise<string> {
    return await this.exec([
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '-M',
      '--no-color',
      `--unified=${contextLines}`,
      ...args,
    ]);
  }

  /** File bytes at a revision. Returns null when the path is absent there. */
  async showFile(revision: string, repositoryRelativePath: string): Promise<string | null> {
    const spec = `${revision}:${repositoryRelativePath}`;
    const kind = (await this.exec(['cat-file', '-t', spec], true)).trim();
    if (kind !== 'blob') return null;
    return await this.exec(['show', spec]);
  }

  /** Immediate file names inside a directory at a revision; directories are dropped. */
  async listTree(revision: string, directoryName: string): Promise<string[]> {
    const spec = directoryName === '' ? `${revision}:` : `${revision}:${directoryName}`;
    const output = await this.exec(['ls-tree', '-z', spec], true);
    const names: string[] = [];
    for (const record of splitNul(output)) {
      // `<mode> <type> <sha>\t<name>`; the name may itself contain tabs.
      const tab = record.indexOf('\t');
      if (tab < 0) continue;
      const type = record.slice(0, tab).split(' ')[1];
      if (type !== 'blob') continue;
      names.push(record.slice(tab + 1));
    }
    return names;
  }

  /**
   * Every path in the work tree the developer can see: tracked files plus
   * untracked ones their ignore rules do not exclude. Used by the boundary
   * shortlist (R4), which must consider a file the author just created as
   * readily as one that has been committed for years.
   */
  async listFiles(pathspec: string | null): Promise<string[]> {
    const output = await this.exec([
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      ...(pathspec === null ? [] : [pathspec]),
    ]);
    return [...new Set(splitNul(output))];
  }

  /**
   * Paths whose contents hold `term` as a fixed, case-insensitive string.
   * Fixed (`-F`) because a term comes from a request or a requirement
   * document and is not a regular expression the caller wrote; `-I` because a
   * binary hit is not evidence a person can read.
   *
   * Exit 1 means git searched and found nothing, which is an answer. Anything
   * above it is a failure and is raised, so an unreadable repository never
   * arrives as "no file matched".
   */
  async grepFiles(term: string, pathspec: string | null): Promise<string[]> {
    const outcome = await this.execOutcome(
      [
        'grep',
        '--untracked',
        '-I',
        '-l',
        '-z',
        '-i',
        '-F',
        '-e',
        term,
        '--',
        ...(pathspec === null ? [] : [pathspec]),
      ],
      true,
    );
    if (outcome.exitCode === 1) return [];
    if (outcome.exitCode !== 0) {
      throw new AmbicodeError('git-failed', `git grep failed with exit code ${String(outcome.exitCode)}.`);
    }
    return splitNul(outcome.stdout);
  }

  /**
   * The most recent non-merge commits that touched any of `paths`, newest
   * first and never more than `limit` of them. A merge carries no file list of
   * its own under `--name-only`, so excluding merges keeps the commit count
   * and the per-file counts derived from it talking about the same thing.
   *
   * A repository with no commits yet answers with nothing rather than failing:
   * "too little history" is a limitation the caller reports, not an error.
   */
  async commitsTouching(paths: readonly string[], limit: number): Promise<string[]> {
    if (paths.length === 0 || limit <= 0) return [];
    const outcome = await this.execOutcome(
      ['log', '--no-merges', '--format=%H', '-n', String(limit), '--', ...paths],
      true,
    );
    if (outcome.exitCode !== 0) return [];
    return outcome.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
  }

  /**
   * The paths each of `commits` changed, grouped by commit. `--no-walk`
   * reports exactly the commits given rather than their ancestry, and under
   * `-z` the stream is `<sha> NUL LF <path> NUL <path> NUL <sha> NUL ...`, so
   * the commit list from `commitsTouching` is what tells a boundary record
   * apart from a path, rather than a guess about what a 40-character name
   * means.
   */
  async commitFileLists(commits: readonly string[]): Promise<{ commit: string; paths: string[] }[]> {
    if (commits.length === 0) return [];
    const known = new Set(commits);
    const output = await this.exec(['log', '--no-walk', '-z', '--format=%H', '--name-only', ...commits, '--']);
    const lists: { commit: string; paths: string[] }[] = [];
    let current: { commit: string; paths: string[] } | null = null;
    for (const record of output.split('\0')) {
      // The format's own terminator arrives attached to the first path of each
      // commit; it is separator, not part of the name.
      const entry = record.startsWith('\n') ? record.slice(1) : record;
      if (entry === '') continue;
      if (known.has(entry)) {
        current = { commit: entry, paths: [] };
        lists.push(current);
        continue;
      }
      current?.paths.push(entry);
    }
    return lists;
  }

  async version(): Promise<string> {
    return (await this.exec(['--version'])).trim();
  }
}

export type RawChangeKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type-changed';

export interface RawChange {
  oldPath: string | null;
  newPath: string | null;
  changeKind: RawChangeKind;
  oldMode: string;
  newMode: string;
}

/**
 * A pathspec that means exactly this path: git's wildcard and magic syntax is
 * off, and the path is read from the repository root whatever the process's
 * working directory is. Without it a file legitimately named `*.ts` would be
 * read as a pattern.
 */
export function literalPathspec(repositoryRelativePath: string): string {
  return `:(literal,top)${repositoryRelativePath}`;
}

export function splitNul(output: string): string[] {
  return output.split('\0').filter((entry) => entry !== '');
}

/**
 * `:<oldmode> <newmode> <oldsha> <newsha> <status>\0<path>[\0<newpath>]\0`
 * Paths arrive as their own NUL-terminated fields, so spaces, newlines, and
 * option-like names need no escaping (doc 02).
 */
export function parseRawZ(output: string): RawChange[] {
  const fields = output.split('\0');
  const changes: RawChange[] = [];
  let index = 0;

  while (index < fields.length) {
    const header = fields[index];
    if (header === undefined || header === '') {
      index += 1;
      continue;
    }
    if (!header.startsWith(':')) {
      throw new AmbicodeError('diff-unparsable', 'git raw diff produced an unexpected record.');
    }
    const parts = header.slice(1).split(' ');
    const oldMode = parts[0] ?? '';
    const newMode = parts[1] ?? '';
    const status = parts[4] ?? '';
    const letter = status.charAt(0);
    const takesTwoPaths = letter === 'R' || letter === 'C';

    const first = fields[index + 1];
    if (first === undefined) {
      throw new AmbicodeError('diff-unparsable', 'git raw diff ended before a path.');
    }
    const second = takesTwoPaths ? fields[index + 2] : undefined;
    if (takesTwoPaths && second === undefined) {
      throw new AmbicodeError('diff-unparsable', 'git raw diff ended before a rename destination.');
    }
    index += takesTwoPaths ? 3 : 2;

    switch (letter) {
      case 'A':
        changes.push({ oldPath: null, newPath: first, changeKind: 'added', oldMode, newMode });
        break;
      case 'D':
        changes.push({ oldPath: first, newPath: null, changeKind: 'deleted', oldMode, newMode });
        break;
      case 'R':
        changes.push({ oldPath: first, newPath: second ?? null, changeKind: 'renamed', oldMode, newMode });
        break;
      case 'C':
        changes.push({ oldPath: first, newPath: second ?? null, changeKind: 'copied', oldMode, newMode });
        break;
      case 'T':
        changes.push({ oldPath: first, newPath: first, changeKind: 'type-changed', oldMode, newMode });
        break;
      default:
        changes.push({ oldPath: first, newPath: first, changeKind: 'modified', oldMode, newMode });
    }
  }
  return changes;
}
