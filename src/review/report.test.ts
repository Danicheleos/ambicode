import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReviewResult } from '../contracts/review.ts';
import { reviewResult } from '../testing/review-fixture.ts';
import { renderReport } from './report.ts';

function render(checks: ReviewResult['checks']): string {
  return renderReport({
    result: { ...reviewResult(), checks },
    snapshotDirectory: '/tmp/snapshot',
    resultPath: '/work/app/.ambicode/reviews/r-0001/result.json',
    pendingApprovals: [],
  });
}

describe('the verification section says whether a command executed', () => {
  const [executed] = reviewResult().checks;
  assert.ok(executed !== undefined);

  it('labels an executed command "ran"', () => {
    const text = render([executed]);
    assert.match(text, /^ {5}ran: eslint -- src\/orders\.ts$/m);
    assert.doesNotMatch(text, /would have run/);
  });

  it('labels a skipped check that carries an argv "would have run", never "ran"', () => {
    const text = render([
      {
        ...executed,
        status: 'skipped',
        exitCode: null,
        durationMs: null,
        outputRef: null,
        mutations: [],
        limitations: ['Remote executable checks are disabled.'],
      },
    ]);
    assert.match(text, /^ {5}would have run: eslint -- src\/orders\.ts$/m);
    assert.doesNotMatch(text, /^ {5}ran:/m);
  });

  it('prints no command line for a check that had none', () => {
    const text = render([{ ...executed, status: 'skipped', argv: [], exitCode: null }]);
    assert.doesNotMatch(text, /ran:/);
  });
});
