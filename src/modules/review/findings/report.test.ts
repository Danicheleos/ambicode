import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReviewResult } from '#types/modules/review';
import { reviewResult } from '#testing/fixtures/review-fixture';
import { renderReport } from './report.ts';

function render(checks: ReviewResult['checks']): string {
  return renderReport({ result: { ...reviewResult(), checks }, resultPath: '/work/app/.ambicode/reviews/r-0001/result.json' });
}

describe('the verification section lists recorded checks', () => {
  it('prints key, phase, exit and files of a recorded check', () => {
    const text = render(reviewResult().checks);
    assert.match(text, /web\/lint green: exit 1/);
    assert.match(text, /on: src\/orders\.ts/);
  });

  it('prints "no check recorded" as a gap, not a pass', () => {
    const text = render([]);
    assert.match(text, /No check recorded/);
    assert.match(text, /gap, not a pass/);
  });
});
