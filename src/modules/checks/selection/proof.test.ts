import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adapterFor } from './adapters.ts';
import { classifyProof } from './proof.ts';
import type { RunnerSummary } from '../types/selection.ts';

const s = (ran: number, failed: number, loadErrors = 0): RunnerSummary => ({ ran, failed, loadErrors });
const red = (cause: string) => ({ proven: false, which: 'red-unproven', cause });
const green = (cause: string) => ({ proven: false, which: 'green-unproven', cause });

test('07-P2: red is proven by one failed test regardless of exit', () => {
  assert.deepEqual(classifyProof('red', 1, s(3, 1)), { proven: true });
  assert.deepEqual(classifyProof('red', 0, s(3, 1)), { proven: true });
});

test('07-P2: green is proven by exit 0 and one ran test', () => {
  assert.deepEqual(classifyProof('green', 0, s(1, 0)), { proven: true });
});

test('07-P2: no-summary comes first', () => {
  assert.deepEqual(classifyProof('red', 1, null), red('no-summary'));
  assert.deepEqual(classifyProof('green', 0, null), green('no-summary'));
});

test('07-P2: load-error beats zero-tests', () => {
  assert.deepEqual(classifyProof('red', 1, s(0, 0, 1)), red('load-error'));
  assert.deepEqual(classifyProof('green', 0, s(0, 0, 1)), green('load-error'));
});

test('07-P2: zero-tests beats no-failure and nonzero-exit', () => {
  assert.deepEqual(classifyProof('red', 1, s(0, 0)), red('zero-tests'));
  assert.deepEqual(classifyProof('green', 1, s(0, 0)), green('zero-tests'));
});

test('07-P2: no-failure is red with tests that all passed', () => {
  assert.deepEqual(classifyProof('red', 0, s(2, 0)), red('no-failure'));
});

test('07-P2: nonzero-exit is green with a failing exit', () => {
  assert.deepEqual(classifyProof('green', 1, s(2, 0)), green('nonzero-exit'));
  assert.deepEqual(classifyProof('green', 1, s(2, 1)), green('nonzero-exit'));
});

test('07-P2: load errors alongside failed tests do not hide the failure', () => {
  assert.deepEqual(classifyProof('red', 1, s(2, 1, 1)), { proven: true });
});

test('07-P3: a syntax error in a new spec is neither red nor green proof', () => {
  const summary = adapterFor('jest').parseSummary?.('Test Suites: 1 failed, 1 total\nTests:       0 total') ?? null;
  assert.deepEqual(classifyProof('red', 1, summary), red('load-error'));
  assert.deepEqual(classifyProof('green', 1, summary), green('load-error'));
});

test('07-P3: zero selected tests are neither red nor green proof', () => {
  const summary = adapterFor('pytest').parseSummary?.('=== no tests ran in 0.01s ===') ?? null;
  assert.deepEqual(classifyProof('red', 5, summary), red('zero-tests'));
  assert.deepEqual(classifyProof('green', 0, summary), green('zero-tests'));
});

test('07-P3: a null summary is neither red nor green proof', () => {
  const summary = adapterFor('vitest').parseSummary?.('Error: spawn ENOENT') ?? null;
  assert.equal(summary, null);
  assert.deepEqual(classifyProof('red', 1, summary), red('no-summary'));
  assert.deepEqual(classifyProof('green', 0, summary), green('no-summary'));
});
