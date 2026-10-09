import type { AdapterId } from '#types/primitives';
import type { RunnerSummary } from '../types/selection.ts';

interface CheckAdapter {
  id: AdapterId;
  role: 'lint' | 'test';
  limitations?: readonly string[];
  /**
   * The verdict a killed run already printed, or null when the output does not show it
   * finished: a runner killed during teardown after its summary has a real outcome.
   */
  parseCompletedRun?: (output: string) => 'passed' | 'failed' | null;
  /** The runner's own final tally, or null when the output has no summary line. */
  parseSummary?: (output: string) => RunnerSummary | null;
}

// Vitest colours its summary even when stdout is not a terminal.
const plain = (output: string): string => output.replace(/\x1b\[[0-9;]*m/g, '');

function lastMatch(output: string, re: RegExp): string | undefined {
  const found = [...plain(output).matchAll(new RegExp(re.source, 'gm'))];
  return found.at(-1)?.[1];
}

function tally(text: string | undefined, word: string): number {
  return Number(new RegExp(`(\\d+) ${word}\\b`).exec(text ?? '')?.[1] ?? 0);
}

/** Jest and vitest print a per-file line and a per-test line; a file that fails to load fails no test. */
function summaryFrom(files: RegExp, tests: RegExp): (output: string) => RunnerSummary | null {
  return (output) => {
    const fileLine = lastMatch(output, files);
    const testLine = lastMatch(output, tests);
    if (fileLine === undefined && testLine === undefined) return null;
    const failed = tally(testLine, 'failed');
    return {
      ran: tally(testLine, 'passed') + failed,
      failed,
      loadErrors: failed === 0 ? tally(fileLine, 'failed') : 0,
    };
  };
}

function parsePytestSummary(output: string): RunnerSummary | null {
  const line = lastMatch(output, /^[= ]*((?:\d+ \w+(?:, )?|no tests ran)+(?: \([^)]*\))? in \d[\d.]*s\b.*?)[= ]*$/);
  if (line === undefined) return null;
  const failed = tally(line, 'failed');
  return { ran: tally(line, 'passed') + failed, failed, loadErrors: tally(line, 'errors?') };
}

function parsePlaywrightSummary(output: string): RunnerSummary | null {
  const count = (word: string) => lastMatch(output, new RegExp(`^\\s*(\\d+ ${word})\\b`));
  const passed = count('passed');
  const failed = count('failed');
  const loadErrors = tally(lastMatch(output, /^\s*(\d+ errors? (?:was|were) not a part of any test)/), 'errors?');
  if (passed === undefined && failed === undefined && loadErrors === 0) return null;
  const failedCount = tally(failed, 'failed');
  return { ran: tally(passed, 'passed') + failedCount, failed: failedCount, loadErrors };
}

/**
 * Reads both the per-file and per-test tallies: a suite that throws on import fails a file
 * without failing a test. A run killed part-way prints neither.
 */
function parseTestSummary(colored: string): 'passed' | 'failed' | null {
  const output = plain(colored);
  const files = /^\s*Test (?:Files|Suites):?\s+(\S.*)$/m.exec(output)?.[1];
  const tests = /^\s*Tests:?\s+(\S.*)$/m.exec(output)?.[1];
  if (files === undefined || tests === undefined) return null;
  const summary = `${files} ${tests}`;
  if (/\b\d+ failed\b/.test(summary)) return 'failed';
  return /\b\d+ passed\b/.test(summary) ? 'passed' : null;
}

const ADAPTERS: Record<AdapterId, CheckAdapter> = {
  eslint: {
    id: 'eslint',
    role: 'lint',
  },
  ruff: {
    id: 'ruff',
    role: 'lint',
  },
  generic: {
    id: 'generic',
    role: 'lint',
  },
  jest: {
    id: 'jest',
    role: 'test',
    parseCompletedRun: parseTestSummary,
    parseSummary: summaryFrom(/^\s*Test Suites:\s+(\S.*)$/, /^\s*Tests:\s+(\S.*)$/),
  },
  vitest: {
    id: 'vitest',
    role: 'test',
    parseCompletedRun: parseTestSummary,
    parseSummary: summaryFrom(/^\s*Test Files\s+(\S.*)$/, /^\s*Tests\s+(\S.*)$/),
  },
  pytest: {
    id: 'pytest',
    role: 'test',
    parseSummary: parsePytestSummary,
    limitations: [
      'pytest has no affected-test selection of its own, so the selection comes entirely from the configured mapping.',
    ],
  },
  playwright: {
    id: 'playwright',
    role: 'test',
    parseSummary: parsePlaywrightSummary,
    limitations: [
      'An end-to-end command may start services or depend on an environment, so its scope is confirmed per run rather than assumed bounded.',
    ],
  },
};

export function adapterFor(id: AdapterId): CheckAdapter {
  return ADAPTERS[id];
}
