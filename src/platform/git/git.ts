import { AmbicodeError } from '#util/errors';
import type { RawChange } from '#types/platform/git';
import type { ProcessRunner } from '#types/platform/ports';

/**
 * Every git invocation goes through here with external diff drivers and
 * textconv filters disabled, so a repository's own configuration cannot change
 * what AMBICODE reads or run a program of its choosing.
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
  gitDir?: string;
  extraEnv?: Record<string, string>;
}

/** The task directories hold ledgers and notes that quote the names searched for; they are not code. */
const scoped = (pathspec: string | null): string[] => [pathspec ?? '.', ':(exclude).ambicode'];

export class Git {
  readonly options: GitOptions;

  constructor(options: GitOptions) {
    this.options = options;
  }

  private async exec(args: readonly string[], allowFailure = false): Promise<string> {
    return (await this.execOutcome(args, allowFailure)).stdout;
  }

  /**
   * Keeps the exit code for callers where nonzero is an answer: `git grep` exits
   * 1 for "no match", while anything above 1 must not be read as an empty result.
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
      // Git needs the operator's own configuration, credential helpers and ssh
      // agent, so it inherits the environment plus narrow overrides.
      env: {
        kind: 'inherited',
        overrides: {
          GIT_OPTIONAL_LOCKS: '0',
          GIT_TERMINAL_PROMPT: '0',
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
   * Writes index changes to `indexFile` instead of `.git/index`, so inspecting
   * the working tree cannot alter the developer's staged state.
   */
  withIndexFile(indexFile: string): Git {
    return new Git({ ...this.options, extraEnv: { ...this.options.extraEnv, GIT_INDEX_FILE: indexFile } });
  }

  async markIntentToAdd(): Promise<void> {
    await this.exec(['add', '--intent-to-add', '--', '.'], true);
  }

  /** This worktree's git directory: its `index` and `HEAD`. */
  async gitDir(): Promise<string> {
    return (await this.exec(['rev-parse', '--path-format=absolute', '--git-dir'])).trim();
  }

  /** The directory every worktree shares: `info/exclude`, refs, objects. */
  async gitCommonDir(): Promise<string> {
    return (await this.exec(['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim();
  }

  async isDirty(): Promise<boolean> {
    return (await this.status()).trim() !== '';
  }

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
    const output = await this.exec(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], true);
    const sha = output.trim();
    return sha === '' ? null : sha;
  }

  async mergeBase(a: string, b: string): Promise<string | null> {
    const output = await this.exec(['merge-base', a, b], true);
    const sha = output.trim();
    return sha === '' ? null : sha;
  }

  async unmergedPaths(): Promise<string[]> {
    const output = await this.exec(['ls-files', '--unmerged', '-z'], true);
    const paths = new Set<string>();
    for (const record of splitNul(output)) {
      const path = record.split('\t').slice(1).join('\t');
      if (path !== '') paths.add(path);
    }
    return [...paths];
  }

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

  async showFile(revision: string, repositoryRelativePath: string): Promise<string | null> {
    const spec = `${revision}:${repositoryRelativePath}`;
    const kind = (await this.exec(['cat-file', '-t', spec], true)).trim();
    if (kind !== 'blob') return null;
    return await this.exec(['show', spec]);
  }

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
   * Fixed-string (`-F`) because a term is not a regular expression the caller
   * wrote; `-I` because a binary hit is not evidence a person can read.
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

  /** Files holding any of these whole words, case-sensitive: the form that finds references to a name (03-M1). */
  async grepWords(words: readonly string[], pathspec: string | null = null): Promise<string[]> {
    if (words.length === 0) return [];
    const outcome = await this.execOutcome(['grep', '--untracked', '-I', '-l', '-z', '-w', '-F', ...words.flatMap((word) => ['-e', word]), '--', ...scoped(pathspec)], true);
    if (outcome.exitCode === 1) return [];
    if (outcome.exitCode !== 0) throw new AmbicodeError('git-failed', `git grep failed with exit code ${String(outcome.exitCode)}.`);
    return splitNul(outcome.stdout);
  }

  /** Line numbers per file of any term, case-insensitive, fixed-string; at most `perFile` lines each. */
  async grepLines(terms: readonly string[], files: readonly string[], perFile = 20): Promise<Map<string, number[]>> {
    const found = new Map<string, number[]>();
    if (terms.length === 0 || files.length === 0) return found;
    const outcome = await this.execOutcome(['grep', '--untracked', '-I', '-n', '-z', '-i', '-F', '-m', String(perFile), ...terms.flatMap((term) => ['-e', term]), '--', ...files.map(literalPathspec)], true);
    if (outcome.exitCode === 1) return found;
    if (outcome.exitCode !== 0) throw new AmbicodeError('git-failed', `git grep failed with exit code ${String(outcome.exitCode)}.`);
    for (const record of outcome.stdout.split('\n')) {
      const match = /^([^\0]+)\0(\d+)\0/.exec(record);
      if (match !== null) found.set(match[1]!, [...(found.get(match[1]!) ?? []), Number(match[2])]);
    }
    return found;
  }

  /** The lines holding a whole word, as `path:line:text`, for `refs`. */
  async grepWordLines(word: string, pathspec: string | null = null): Promise<{ path: string; line: number; text: string }[]> {
    const outcome = await this.execOutcome(['grep', '--untracked', '-I', '-n', '-z', '-w', '-F', '-e', word, '--', ...scoped(pathspec)], true);
    if (outcome.exitCode === 1) return [];
    if (outcome.exitCode !== 0) throw new AmbicodeError('git-failed', `git grep failed with exit code ${String(outcome.exitCode)}.`);
    const rows: { path: string; line: number; text: string }[] = [];
    for (const record of outcome.stdout.split('\n')) {
      const match = /^([^\0]+)\0(\d+)\0(.*)$/.exec(record);
      if (match !== null) rows.push({ path: match[1]!, line: Number(match[2]), text: match[3]! });
    }
    return rows;
  }

  async version(): Promise<string> {
    return (await this.exec(['--version'])).trim();
  }
}

/**
 * A literal pathspec from the repository root: without it a file named `*.ts`
 * would be read as a pattern.
 */
export function literalPathspec(repositoryRelativePath: string): string {
  return `:(literal,top)${repositoryRelativePath}`;
}

export function splitNul(output: string): string[] {
  return output.split('\0').filter((entry) => entry !== '');
}

/**
 * `:<oldmode> <newmode> <oldsha> <newsha> <status>\0<path>[\0<newpath>]\0`
 * Paths are their own NUL-terminated fields, so no name needs escaping.
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
