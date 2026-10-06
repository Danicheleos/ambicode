import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adapterFor, type RunnerSummary } from './adapters.ts';
import type { AdapterId } from '../contracts/primitives.ts';

type Row = [name: string, output: string, expected: RunnerSummary | null];

const s = (ran: number, failed: number, loadErrors = 0): RunnerSummary => ({ ran, failed, loadErrors });

const TABLE: Record<'jest' | 'vitest' | 'pytest' | 'playwright', Row[]> = {
  jest: [
    ['passing', 'Test Suites: 1 passed, 1 total\nTests:       3 passed, 3 total\nTime:        1.2 s', s(3, 0)],
    ['failing', 'Test Suites: 1 failed, 1 total\nTests:       1 failed, 2 passed, 3 total', s(3, 1)],
    ['zero tests', 'Test Suites: 1 passed, 1 total\nTests:       1 skipped, 1 total', s(0, 0)],
    ['syntax error', 'Test Suites: 1 failed, 1 total\nTests:       0 total\nSnapshots:   0 total', s(0, 0, 1)],
    ['last summary wins', 'Tests:       1 failed, 1 total\nTests:       2 passed, 2 total', s(2, 0)],
    ['unrecognised', 'No tests found, exiting with code 1', null],
  ],
  vitest: [
    ['passing', ' Test Files  1 passed (1)\n      Tests  3 passed (3)\n   Duration  300ms', s(3, 0)],
    ['failing', ' Test Files  1 failed | 1 passed (2)\n      Tests  1 failed | 3 passed (4)', s(4, 1)],
    ['zero tests', ' Test Files  1 passed (1)\n      Tests  1 skipped | 1 todo (2)', s(0, 0)],
    ['syntax error', ' Test Files  1 failed (1)\n      Tests  no tests', s(0, 0, 1)],
    ['unrecognised', 'No test files found, exiting with code 1', null],
  ],
  pytest: [
    ['passing', '========================= 3 passed in 0.12s =========================', s(3, 0)],
    ['failing', '========================= 1 failed, 2 passed in 0.12s =========================', s(3, 1)],
    ['skipped excluded', '=== 1 passed, 1 skipped in 0.02s ===', s(1, 0)],
    ['quiet mode', '1 failed, 1 passed in 0.03s', s(2, 1)],
    ['zero tests', '=== no tests ran in 0.01s ===', s(0, 0)],
    ['collection error', 'Interrupted: 1 error during collection\n==== 1 error in 0.05s ====', s(0, 0, 1)],
    ['errors', '==== 2 errors in 0.05s ====', s(0, 0, 2)],
    ['unrecognised', 'ModuleNotFoundError: No module named pytest', null],
  ],
  playwright: [
    ['passing', 'Running 2 tests using 1 worker\n  2 passed (3.1s)', s(2, 0)],
    ['failing', '  1 failed\n    [chromium] › a.spec.ts:3:1 › x\n  2 passed (3.1s)', s(3, 1)],
    ['skipped excluded', '  1 skipped\n  2 passed (1.0s)', s(2, 0)],
    ['zero tests', 'Error: No tests found', null],
    ['load error', 'Running 1 test using 1 worker\n  1 error was not a part of any test, see above for details', s(0, 0, 1)],
    ['unrecognised', 'browserType.launch: Executable does not exist', null],
  ],
};

for (const [id, rows] of Object.entries(TABLE)) {
  for (const [name, output, expected] of rows) {
    test(`07-P1: ${id} ${name}`, () => {
      assert.deepEqual(adapterFor(id as AdapterId).parseSummary?.(output), expected);
    });
  }
}

test('07-P1: eslint, ruff and generic have no parseSummary', () => {
  for (const id of ['eslint', 'ruff', 'generic'] as const) {
    assert.equal(adapterFor(id).parseSummary, undefined);
  }
});

test('07-P1: stdout and stderr joined are read as one output', () => {
  assert.deepEqual(adapterFor('jest').parseSummary?.('stdout noise\nTests:       1 passed, 1 total\n'), s(1, 0));
});

test('07-P1: a coloured vitest summary (printed even when stdout is not a terminal) is read as the plain one', () => {
  const coloured = '\x1b[2m Test Files \x1b[22m \x1b[1m\x1b[31m1 failed\x1b[39m\x1b[22m\x1b[90m (1)\x1b[39m\n\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[31m1 failed\x1b[39m\x1b[22m\x1b[2m | \x1b[22m\x1b[1m\x1b[32m2 passed\x1b[39m\x1b[22m\x1b[90m (3)\x1b[39m\n';
  assert.deepEqual(adapterFor('vitest').parseSummary?.(coloured), s(3, 1));
  assert.equal(adapterFor('vitest').parseCompletedRun?.(coloured), 'failed');
});
