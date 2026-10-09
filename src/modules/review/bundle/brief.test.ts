import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHunks } from '#platform/git/diff';
import { reviewResult } from '#testing/fixtures/review-fixture';
import { renderBrief, rangesOf } from './brief.ts';
import type { ReviewBundle } from '#types/modules/review';
import type { DiffFile } from '#types/platform/git';

const section = ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1,4 +1,6 @@', ' one', '+two', '+three', ' four', '-five', ' six', '+seven'].join('\n');
const file: DiffFile = { oldPath: 'src/a.ts', newPath: 'src/a.ts', changeKind: 'modified', binary: false, addedLines: 3, removedLines: 1, hunks: parseHunks(section), patchSection: section };

function bundleOf(overrides: Partial<ReviewBundle['result']> = {}): ReviewBundle {
  const result = { ...reviewResult(), ...overrides };
  const rules = [{ qualifiedId: 'team/no-any', authority: 'team', instruction: 'Do not use any.' }];
  return { reviewId: 'r-1', files: [file], result, snapshot: { directory: '/tmp/snap' }, policies: [{ policy: { rules } }] } as unknown as ReviewBundle;
}

describe('review brief', () => {
  it('rangesOf collapses consecutive lines and keeps gaps', () => {
    assert.equal(rangesOf(new Set([5, 1, 2, 3, 9])), '1-3, 5, 9');
    assert.equal(rangesOf(new Set()), '(none)');
  });

  it('names the target, the addressable ranges per side and the diff for each file', () => {
    const text = renderBrief(bundleOf());
    assert.match(text, /^# Review brief r-1/);
    assert.ok(text.includes('### src/a.ts [modified]\nnew-side lines: 1-6\nold-side lines: 1-4\n'));
    assert.ok(text.includes(section));
  });

  it('renders each policy rule as pack/rule (authority): instruction', () => {
    assert.match(renderBrief(bundleOf()), /^team\/no-any \(team\): Do not use any\.$/m);
  });

  it('prints requirement sources and check results, and says so when there are none', () => {
    const none = renderBrief(bundleOf({ requirements: [], checks: [] }));
    assert.match(none, /\(none supplied: quality review\)/);
    assert.match(none, /\(no check ran\)/);
    const checks = [{ ...reviewResult().checks[0]!, projectId: 'app', checkId: 'unit', status: 'failed' as const, exitCode: 1, limitations: ['ran 3 of 9 files'] }];
    const requirements = [{ ...reviewResult().requirements[0]!, id: 'ORD-7', title: 'Totals', content: 'Totals include tax.' }];
    const text = renderBrief(bundleOf({ checks, requirements }));
    assert.match(text, /### ORD-7: Totals\nTotals include tax\./);
    assert.match(text, /- app\/unit: failed, exit 1; limitations: ran 3 of 9 files/);
  });

  it('stays within the diff plus a fixed envelope, so the reviewer input is the measured input', () => {
    const text = renderBrief(bundleOf({ requirements: [], checks: [] }));
    assert.ok(Buffer.byteLength(text) < Buffer.byteLength(section) + 1200, `${Buffer.byteLength(text)}`);
  });
});
