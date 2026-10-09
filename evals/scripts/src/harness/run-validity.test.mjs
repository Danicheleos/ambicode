import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { infrastructureError } from './evals-bench.mjs';
import { invalidRuns, NO_TURN } from './run-validity.mjs';

// Both classes, decided explicitly: a new error shape gets a row here before the classifier changes.
const INFRASTRUCTURE = ["exit 1: You've hit your session limit · resets 11pm", 'exit 1: Not logged in · Please run /login', 'interrupted', 'scaffold_script failed: exit 1'];
const ARM_OUTCOME = ['exit 1: Reached maximum number of turns (40)', 'timed out', 'timeout after 900s'];

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

  it('classifies every recorded error shape the same way score and the gate do', () => {
    for (const error of INFRASTRUCTURE) assert.equal(infrastructureError({ error }), error, error);
    for (const error of ARM_OUTCOME) assert.equal(infrastructureError({ error }), null, error);
    assert.equal(infrastructureError({ error: null }), null);
  });

  it('flags a run that ended with no error and no model turn, and leaves one with no turn count alone', () => {
    assert.equal(infrastructureError({ turns: 0, error: null }), NO_TURN);
    assert.equal(infrastructureError({ turns: 0 }), NO_TURN);
    assert.equal(infrastructureError({ turns: 3 }), null);
    assert.equal(infrastructureError({}), null);
    assert.equal(infrastructureError({ turns: 0, error: 'timed out' }), null);
  });

  it('fails a trigger result whose negative case passed only because its run died', () => {
    // A `max: 0` grader passes on a run that never started: that is not "nothing fired".
    const results = { cases: [{ name: 'neg-x', arms: { with: [{ passed: true, score: 1, graders: [{ name: 'no-skill', passed: true }], error: INFRASTRUCTURE[1] }] } }] };
    assert.deepEqual(invalidRuns(results).map((r) => r.case), ['neg-x']);
  });
});
