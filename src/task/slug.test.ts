import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mintTaskSlug } from './slug.ts';

describe('mintTaskSlug names a task from the request alone', () => {
  it('prefers a ticket key over the words around it', () => {
    assert.equal(mintTaskSlug('ORD-17 which files would this touch?'), 'ORD-17');
    assert.equal(mintTaskSlug('see https://x.atlassian.net/browse/ORD-17 please'), 'ORD-17');
  });

  it('gives the same slug for the same words, and drops filler', () => {
    const a = mintTaskSlug('How does the order total validation work?');
    assert.equal(a, 'order-total-validation-work');
    assert.equal(mintTaskSlug('how does the Order Total validation work'), a);
  });

  it('caps the length and never ends on a hyphen', () => {
    const slug = mintTaskSlug('internationalization infrastructure reconfiguration documentation modernization');
    assert.ok(slug !== null && slug.length <= 40 && !slug.endsWith('-'), String(slug));
  });

  it('falls back to a stable hash when no Latin word survives, and to null for nothing', () => {
    const a = mintTaskSlug('как работает проверка суммы');
    assert.match(a ?? '', /^task-[0-9a-f]{8}$/);
    assert.equal(mintTaskSlug('как работает проверка суммы'), a);
    assert.notEqual(mintTaskSlug('другой вопрос'), a);
    assert.equal(mintTaskSlug('   '), null);
  });
});
