import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ticketOf } from './shortlist-recall.mjs';

describe('ticketOf', () => {
  it('returns the text between the ticket tags, trimmed', () => {
    assert.equal(ticketOf('Find the files.\n<ticket>\n  Export is slow.\n  See ORD-1.\n</ticket>\nThanks'), 'Export is slow.\n  See ORD-1.');
  });

  it('is null for a prompt without a ticket, so a review case is skipped rather than searched with nothing', () => {
    assert.equal(ticketOf('Review this merge request.'), null);
  });
});
