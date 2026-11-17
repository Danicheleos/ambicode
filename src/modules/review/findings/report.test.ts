import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReviewResult } from '#types/modules/review';
import { finding, reviewResult } from '#testing/fixtures/review-fixture';
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

describe('the requirements line', () => {
  it('names a requirement once when its id, title and url are the same text, and keeps a real title', () => {
    const url = 'https://x.atlassian.net/browse/VS-1';
    const text = renderReport({ result: { ...reviewResult(), requirements: [{ id: url, url, title: url, retrievedAt: 't', content: 'c' }, { id: 'VS-2', url: 'https://x/VS-2', title: 'Support wizard', retrievedAt: 't', content: 'c' }] }, resultPath: '/r/result.json' });
    assert.match(text, new RegExp(`requirements\\n     ${url}\\n     VS-2  Support wizard  https://x/VS-2\\n`));
  });
});

describe('supporting locations', () => {
  it('print as one also: line in the report', () => {
    const result = { ...reviewResult(), findings: [finding({ id: 'f1', supportingLocations: [{ oldPath: 'src/a.ts', newPath: 'src/a.ts', side: 'new', line: 4 }, { oldPath: 'src/b.ts', newPath: null, side: 'old', line: 9 }] }), finding({ id: 'f2' })] };
    const text = renderReport({ result, resultPath: '/r/result.json' });
    assert.equal(text.split('\n').filter((line) => line.startsWith('   also:')).length, 1);
    assert.match(text, /   also: src\/a\.ts:4, src\/b\.ts:9\n/);
  });
});

describe('finding header', () => {
  it('names both values: risk and confidence', () => {
    const text = renderReport({ result: { ...reviewResult(), findings: [finding({ id: 'f1', risk: 'medium', confidence: 'low' })] }, resultPath: '/r/result.json' });
    assert.match(text, /   \[risk: medium · confidence: low\] \S+  f1\n/);
  });

  it('prints problem, impact and confidence with its reason as three lines', () => {
    const text = renderReport({ result: { ...reviewResult(), findings: [finding({ id: 'f1', confidence: 'low' })] }, resultPath: '/r/result.json', compact: true });
    assert.match(text, /   Problem:    The reduce has no initial value when the list is empty\.\n   Impact:     An empty order throws instead of totalling zero\.\n   Confidence: low — the call site passes an empty array in the diff\.\n/);
  });
});

describe('part 4', () => {
  const requirement = { id: 'VS-1', url: 'https://x/VS-1', title: 'Totals', retrievedAt: 't', content: 'c' };
  const result = {
    ...reviewResult(), requirements: [requirement, { ...requirement, id: 'VS-2' }],
    requirementCoverage: [{ ref: 'VS-1', point: 'sums', status: 'missed' as const, note: 'empty list', finding: 'f1' }, { ref: 'VS-1', point: 'rounds', status: 'cannot-verify' as const, note: '', finding: null }],
    omissions: [{ kind: 'attention' as const, text: 'security.md was treated as repository content' }, { kind: 'scope' as const, text: 'test code was not reviewed' }, { kind: 'scope' as const, text: 'diff fetched with glab' }],
  };

  it('lists requirement points, then what needs attention, then the routine scope in full', () => {
    const text = renderReport({ result, resultPath: '/r/result.json' });
    const part = text.slice(text.indexOf('4. OMISSIONS'));
    assert.match(part, /requirements\n     VS-1\n       missed \(f1\): sums - empty list\n       cannot verify from the diff: rounds\n     VS-2  \(no per-point answer\)\n/);
    assert.match(part, /needs attention\n     - security\.md was treated as repository content\n/);
    assert.match(part, /review scope\n     - test code was not reviewed\n     - diff fetched with glab/);
  });

  it('the compact form, which the read-back copies, folds the routine scope into one line', () => {
    const text = renderReport({ result, resultPath: '/r/result.json', compact: true });
    assert.match(text, /   review scope: 2 routine note\(s\); the full list is in report\.txt/);
    assert.doesNotMatch(text, /test code was not reviewed/);
    assert.match(text, /needs attention\n     - security\.md/);
  });
});
