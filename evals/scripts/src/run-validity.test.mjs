import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { invalidRuns } from './run-validity.mjs';

describe('run-validity', () => {
  it('flags runs that died outside the arm, not those that hit their own turn or time limit', () => {
    const results = {
      cases: [
        { name: 'neg-http', arms: { with: [{ passed: true, error: "exit 1: You've hit your session limit" }, { passed: true }] } },
        { name: 'review-mr', arms: { with: [{ error: 'exit 1: Reached maximum number of turns (4)' }, { error: 'timed out' }, { error: 'interrupted' }] } },
      ],
    };
    assert.deepEqual(
      invalidRuns(results).map((r) => [r.case, r.run]),
      [['neg-http', 0], ['review-mr', 2]],
    );
  });
});
