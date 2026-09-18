import path from 'node:path';
import type { AdapterId } from '../contracts/primitives.ts';

/**
 * What each supported runner can actually do, pinned to the versions listed in
 * `docs/compatibility.md`. An adapter claims enumeration only where it was
 * observed to enumerate; the selector turns a missing capability into a request
 * for approval or a mapping, never into a silent whole-suite run (doc 05).
 */

export type EnumerationMode =
  | { kind: 'none' }
  /** Enumerates from an explicit list of changed source files. */
  | { kind: 'from-files'; argv: (executable: string, files: readonly string[]) => string[] }
  /** Enumerates from a git revision; the runner inspects the repository itself. */
  | { kind: 'from-revision'; argv: (executable: string, revision: string) => string[] };

export interface CheckAdapter {
  id: AdapterId;
  role: 'lint' | 'test';
  /** Basenames the configured command must use for enumeration to be trusted. */
  executableNames: readonly string[];
  enumeration: EnumerationMode;
  /** Interprets the runner's own output when enumerating. */
  parseEnumeration?: (stdout: string, projectRootAbsolute: string) => string[];
  /** Notes attached to every result this adapter produces. */
  limitations?: readonly string[];
}

function linesToPaths(stdout: string, projectRootAbsolute: string): string[] {
  const paths: string[] = [];
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;
    // Runners print either absolute paths (jest) or project-relative ones
    // (vitest). Both are normalized to project-relative here.
    const relative = path.isAbsolute(line) ? path.relative(projectRootAbsolute, line) : line;
    if (relative.startsWith('..')) continue; // outside the project: not ours to run
    paths.push(relative.split(path.sep).join('/'));
  }
  return paths;
}

const ADAPTERS: Record<AdapterId, CheckAdapter> = {
  eslint: {
    id: 'eslint',
    role: 'lint',
    executableNames: ['eslint'],
    enumeration: { kind: 'none' },
  },
  ruff: {
    id: 'ruff',
    role: 'lint',
    executableNames: ['ruff'],
    enumeration: { kind: 'none' },
  },
  jest: {
    id: 'jest',
    role: 'test',
    executableNames: ['jest'],
    enumeration: {
      kind: 'from-files',
      argv: (executable, files) => [executable, '--listTests', '--findRelatedTests', ...files],
    },
    parseEnumeration: linesToPaths,
  },
  vitest: {
    id: 'vitest',
    role: 'test',
    executableNames: ['vitest'],
    // Observed on vitest 5.0.1: `list` rejects `--related`, and `related` has no
    // listing mode, so the only enumeration available is revision-based.
    enumeration: {
      kind: 'from-revision',
      argv: (executable, revision) => [executable, 'list', '--filesOnly', '--changed', revision],
    },
    parseEnumeration: linesToPaths,
    limitations: [
      'Vitest selected the affected tests from the repository working tree at the moment of enumeration, not from the pinned snapshot.',
      'Vitest cannot follow a dynamic import whose specifier is computed, so a test reached only that way may be missing from the selection.',
    ],
  },
  pytest: {
    id: 'pytest',
    role: 'test',
    executableNames: ['pytest', 'python', 'python3'],
    enumeration: { kind: 'none' },
    limitations: [
      'pytest has no affected-test selection of its own, so the selection comes entirely from the configured mapping.',
    ],
  },
  playwright: {
    id: 'playwright',
    role: 'test',
    executableNames: ['playwright'],
    enumeration: { kind: 'none' },
    limitations: [
      'An end-to-end command may start services or depend on an environment, so its scope is confirmed per run rather than assumed bounded.',
    ],
  },
};

export function adapterFor(id: AdapterId): CheckAdapter {
  return ADAPTERS[id];
}

/**
 * Enumeration appends adapter-specific arguments to the configured executable.
 * If the project wraps the runner (a package script, a task runner), the
 * basename will not match and enumeration is not attempted, because appending
 * `--listTests` to `npm` would not mean what it means to jest.
 */
export function enumerationExecutable(adapter: CheckAdapter, argv: readonly string[]): string | null {
  const executable = argv[0];
  if (executable === undefined) return null;
  const base = path.basename(executable).replace(/\.(cmd|exe|bat|ps1)$/i, '');
  return adapter.executableNames.includes(base) ? executable : null;
}
