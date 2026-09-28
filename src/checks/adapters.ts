import path from 'node:path';
import type { AdapterId } from '../contracts/primitives.ts';

export type EnumerationMode =
  | { kind: 'none' }
  | { kind: 'from-files'; argv: (executable: string, files: readonly string[]) => string[] }
  | { kind: 'from-revision'; argv: (executable: string, revision: string) => string[] };

export interface CheckAdapter {
  id: AdapterId;
  role: 'lint' | 'test';
  executableNames: readonly string[];
  enumeration: EnumerationMode;
  parseEnumeration?: (stdout: string, projectRootAbsolute: string) => string[];
  limitations?: readonly string[];
  /**
   * The verdict a killed run already printed, or null when the output does not show it
   * finished: a runner killed during teardown after its summary has a real outcome.
   */
  parseCompletedRun?: (output: string) => 'passed' | 'failed' | null;
}

/**
 * Reads both the per-file and per-test tallies: a suite that throws on import fails a file
 * without failing a test. A run killed part-way prints neither.
 */
function parseTestSummary(output: string): 'passed' | 'failed' | null {
  const files = /^\s*Test (?:Files|Suites):?\s+(\S.*)$/m.exec(output)?.[1];
  const tests = /^\s*Tests:?\s+(\S.*)$/m.exec(output)?.[1];
  if (files === undefined || tests === undefined) return null;
  const summary = `${files} ${tests}`;
  if (/\b\d+ failed\b/.test(summary)) return 'failed';
  return /\b\d+ passed\b/.test(summary) ? 'passed' : null;
}

function linesToPaths(stdout: string, projectRootAbsolute: string): string[] {
  const paths: string[] = [];
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;
    const relative = path.isAbsolute(line) ? path.relative(projectRootAbsolute, line) : line;
    if (relative.startsWith('..')) continue;
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
  generic: {
    id: 'generic',
    role: 'lint',
    executableNames: [],
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
    parseCompletedRun: parseTestSummary,
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
    parseCompletedRun: parseTestSummary,
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
 * Enumeration appends adapter arguments to the configured executable. A wrapped
 * runner's basename will not match, so enumeration is not attempted.
 */
export function enumerationExecutable(adapter: CheckAdapter, argv: readonly string[]): string | null {
  const executable = argv[0];
  if (executable === undefined) return null;
  const base = path.basename(executable).replace(/\.(cmd|exe|bat|ps1)$/i, '');
  return adapter.executableNames.includes(base) ? executable : null;
}
