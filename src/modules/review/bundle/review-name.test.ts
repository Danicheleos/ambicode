import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reviewName, taskSlugFor } from './review-name.ts';

const NOW = new Date('2026-09-22T14:35:00');

describe('review directory names', () => {
  it('is the time of day plus the minted id, so two reviews never collide', () => {
    assert.equal(reviewName(NOW, 'a1b2'), 'review-20260922-143500-a1b2');
    assert.notEqual(reviewName(NOW, 'a1b2'), reviewName(NOW, 'c3d4'));
  });

  it('keeps the name a legal, bounded path segment', () => {
    const name = reviewName(NOW, '../../esc ape:"<x>"' + 'y'.repeat(100));
    assert.ok(!/[\\/:*?"<>|]/.test(name), name);
    assert.ok(name.length <= 80, `${name.length}`);
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
});
