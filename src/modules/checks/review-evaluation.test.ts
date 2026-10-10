import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { finding, reviewResult } from '#testing/fixtures/review-fixture';
import { evaluateReview } from './review-evaluation.ts';
import type { ReviewEntry } from '#types/modules/checks';

const reviewEntry = (fields: Record<string, unknown> = {}) => ({ id: 'rv', at: '2026-01-01T00:00:00Z', kind: 'review', route: 'route-1', reviewerRan: true, ...fields }) as ReviewEntry;
const at = (path: string, id: string) => finding({ id, location: { oldPath: path, newPath: path, side: 'new', line: 1 } });
const result = (...paths: string[]) => reviewResult({ kind: 'working', findings: paths.map((p, i) => at(p, `f${i + 1}`)) });

describe('evaluateReview (07-V)', () => {
  it('07-V1: any finding revises fix, in or out of the touched files', () => {
    const out = evaluateReview(reviewEntry(), result('src/a.ts', 'src/other.ts'));
    assert.equal(out.next, 'revise-fix');
    assert.ok(out.next === 'revise-fix' && out.findings.length === 2);
    assert.match(out.next === 'revise-fix' ? out.findings[1]! : '', /^f2 src\/other\.ts:1 — /);
  });

  it('07-V2: no finding, no result, or a reviewer that did not run proceeds', () => {
    assert.deepEqual(evaluateReview(reviewEntry(), result()), { next: 'proceed' });
    assert.deepEqual(evaluateReview(reviewEntry(), null), { next: 'proceed' });
    assert.deepEqual(evaluateReview(reviewEntry({ reviewerRan: false }), result('src/a.ts')), { next: 'proceed' });
  });

  it('07-V3: a finding line is cut to one short line', () => {
    const long = finding({ id: 'f1', explanation: `first\n${'x'.repeat(400)}` });
    const out = evaluateReview(reviewEntry(), reviewResult({ kind: 'working', findings: [long] }));
    assert.ok(out.next === 'revise-fix' && !out.findings[0]!.includes('\n') && out.findings[0]!.length < 200);
  });
});
