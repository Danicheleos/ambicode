import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReviewTarget } from '../contracts/review.ts';
import { reviewNameBase, uniqueReviewName } from './review-name.ts';

/**
 * A review directory is found by reading its name. These assert what a person
 * scanning `.ambicode/reviews/` can tell without opening anything.
 */

const NOW = new Date('2026-09-22T14:35:00');

function target(overrides: Partial<ReviewTarget> = {}): ReviewTarget {
  return {
    kind: 'working',
    repositoryRoot: '/repo',
    snapshotId: 'abc',
    headSha: null,
    baseSha: null,
    baseRef: null,
    remote: null,
    notes: [],
    ...overrides,
  } as ReviewTarget;
}

function mergeRequest(iid: number, provider: 'gitlab' | 'github' = 'gitlab'): ReviewTarget {
  return target({
    kind: 'merge-request',
    remote: {
      provider,
      host: 'gitlab.com',
      projectId: '1',
      projectPath: 'acme/web/storefront',
      sourceProjectId: '1',
      sourceProjectPath: 'acme/web/storefront',
      mergeRequestIid: iid,
      webUrl: 'https://gitlab.com/x/-/merge_requests/2716',
      versionId: 2041974100,
    },
  } as Partial<ReviewTarget>);
}

describe('review directory names', () => {
  it('names a merge request review by its number, ticket and date', () => {
    const name = reviewNameBase({
      target: mergeRequest(2716),
      requirementIds: ['ORD-17'],
      now: NOW,
    });
    assert.equal(name, 'MR_2716_ORD-17_2026-09-22T14-35');
  });

  it('uses the host\'s own word for the change', () => {
    assert.match(reviewNameBase({ target: mergeRequest(42, 'github'), requirementIds: [], now: NOW }), /^PR_42_/);
    assert.match(reviewNameBase({ target: mergeRequest(42, 'gitlab'), requirementIds: [], now: NOW }), /^MR_42_/);
  });

  it('omits the ticket when none was supplied rather than leaving a gap', () => {
    const name = reviewNameBase({ target: mergeRequest(2716), requirementIds: [], now: NOW });
    assert.equal(name, 'MR_2716_2026-09-22T14-35');
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

  it('separates two reviews of the same merge request by the time of day', () => {
    const morning = reviewNameBase({ target: mergeRequest(2716), requirementIds: [], now: new Date('2026-09-22T09:04:00') });
    const afternoon = reviewNameBase({ target: mergeRequest(2716), requirementIds: [], now: NOW });
    assert.equal(morning, 'MR_2716_2026-09-22T09-04');
    assert.notEqual(morning, afternoon);
    // Same day sorts chronologically, so the listing reads in order.
    assert.ok(morning < afternoon);
  });

  it('still refuses to reuse a directory if two land in the same minute', async () => {
    // Re-running a review after a failure is exactly this case.
    const taken = new Set(['MR_2716_2026-09-22T14-35']);
    const input = { target: mergeRequest(2716), requirementIds: [], now: NOW };
    const second = await uniqueReviewName(input, async (name) => taken.has(name), 'fallback-id');
    assert.equal(second, 'MR_2716_2026-09-22T14-35_2');

    taken.add(second);
    const third = await uniqueReviewName(input, async (name) => taken.has(name), 'fallback-id');
    assert.equal(third, 'MR_2716_2026-09-22T14-35_3');
  });

  it('falls back to the unique id rather than looping or reusing a directory', async () => {
    const name = await uniqueReviewName(
      { target: mergeRequest(2716), requirementIds: [], now: NOW },
      async () => true,
      'a1b2c3d4',
      3,
    );
    assert.match(name, /a1b2c3d4$/);
  });
});
