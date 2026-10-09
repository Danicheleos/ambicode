import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReviewTarget } from '#types/modules/review';
import { reviewNameBase, taskSlugFor, uniqueReviewName } from './review-name.ts';

const NOW = new Date('2026-09-22T14:35:00');

function target(overrides: Partial<ReviewTarget> = {}): ReviewTarget {
  return {
    kind: 'working',
    repositoryRoot: '/repo',
    snapshotId: 'abc',
    headSha: null,
    baseSha: null,
    baseRef: null,
    notes: [],
    ...overrides,
  } as ReviewTarget;
}

function branch(): ReviewTarget {
  return target({ kind: 'branch', baseRef: 'main' });
}

describe('review directory names', () => {
  it('names a branch review by its base, ticket and date', () => {
    const name = reviewNameBase({ target: branch(), requirementIds: ['ORD-17'], now: NOW });
    assert.equal(name, 'branch_main_ORD-17_2026-09-22T14-35');
  });

  it('names branch and working-tree reviews too', () => {
    assert.equal(
      reviewNameBase({ target: target({ kind: 'branch', baseRef: 'origin/main' }), requirementIds: [], now: NOW }),
      'branch_origin-main_2026-09-22T14-35',
    );
    assert.equal(reviewNameBase({ target: target(), requirementIds: [], now: NOW }), 'local_2026-09-22T14-35');
  });

  it('keeps the name a legal, bounded path segment', () => {
    const name = reviewNameBase({
      target: target({ kind: 'branch', baseRef: 'feature/PROJ 42: "fix" <everything>/' }),
      requirementIds: ['../../escape'],
      now: NOW,
    });
    assert.ok(!/[\\/:*?"<>|]/.test(name), name);
    assert.ok(!name.startsWith('.'), name);
    assert.ok(!name.endsWith('.') && !name.endsWith(' '), name);
    assert.ok(name.length <= 80, `${name.length}`);
  });

  it('separates two reviews of the same branch by the time of day', () => {
    const morning = reviewNameBase({ target: branch(), requirementIds: [], now: new Date('2026-09-22T09:04:00') });
    const afternoon = reviewNameBase({ target: branch(), requirementIds: [], now: NOW });
    assert.equal(morning, 'branch_main_2026-09-22T09-04');
    assert.notEqual(morning, afternoon);
    assert.ok(morning < afternoon);
  });

  it('still refuses to reuse a directory if two land in the same minute', async () => {
    const taken = new Set(['branch_main_2026-09-22T14-35']);
    const input = { target: branch(), requirementIds: [], now: NOW };
    const second = await uniqueReviewName(input, async (name) => taken.has(name), 'fallback-id');
    assert.equal(second, 'branch_main_2026-09-22T14-35_2');

    taken.add(second);
    const third = await uniqueReviewName(input, async (name) => taken.has(name), 'fallback-id');
    assert.equal(third, 'branch_main_2026-09-22T14-35_3');
  });

  it('falls back to the unique id rather than looping or reusing a directory', async () => {
    const name = await uniqueReviewName(
      { target: branch(), requirementIds: [], now: NOW },
      async () => true,
      'a1b2c3d4',
      3,
    );
    assert.match(name, /a1b2c3d4$/);
  });
});

describe('the task a review belongs to', () => {
  it('takes the ticket as the slug, because that is what the work is called everywhere else', () => {
    assert.equal(taskSlugFor({ requirementIds: ['ORD-17'], task: null }), 'ORD-17');
  });

  it('prefers the slug the caller passed, which is the case with no ticket to use', () => {
    assert.equal(
      taskSlugFor({ requirementIds: [], task: 'fix-retry-backoff_2026-09-23T10-15' }),
      'fix-retry-backoff_2026-09-23T10-15',
    );
  });

  it('has no task when there is neither, so those artifacts stay where they were', () => {
    assert.equal(taskSlugFor({ requirementIds: [], task: null }), null);
    assert.equal(taskSlugFor({ requirementIds: [], task: '   ' }), null);
  });

  it('leaves the ticket out of the name when the directory above already carries it', () => {
    const input = { target: target(), requirementIds: ['ORD-17'], now: NOW };
    assert.equal(reviewNameBase(input), 'local_ORD-17_2026-09-22T14-35');
    assert.equal(reviewNameBase({ ...input, insideTask: true }), 'local_2026-09-22T14-35');
  });
});
