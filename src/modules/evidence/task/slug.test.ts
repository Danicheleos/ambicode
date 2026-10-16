import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mintTaskSlug } from './slug.ts';

describe('mintTaskSlug names a task from the request alone', () => {
  it('gives the same slug for the same words in any case or punctuation', () => {
    const a = mintTaskSlug('How does the order total validation work?');
    assert.equal(a, 'how-does-the-order-total-validation-work');
    assert.equal(mintTaskSlug('how does the Order Total validation work'), a);
    assert.equal(mintTaskSlug('which files? ORD-17'), 'ord-17', 'an issue key names the task');
    assert.equal(mintTaskSlug('https://inseer.atlassian.net/browse/VS-6735'), 'vs-6735');
  });

  it('caps the length and never ends on a hyphen', () => {
    const slug = mintTaskSlug('internationalization infrastructure reconfiguration documentation modernization');
    assert.ok(slug !== null && slug.length <= 48 && !slug.endsWith('-'), String(slug));
  });

  it('falls back to a stable hash when no Latin word survives, and to null for nothing', () => {
    const a = mintTaskSlug('как работает проверка суммы');
    assert.match(a ?? '', /^task-[0-9a-f]{8}$/);
    assert.equal(mintTaskSlug('как работает проверка суммы'), a);
    assert.notEqual(mintTaskSlug('другой вопрос'), a);
    assert.equal(mintTaskSlug('   '), null);
  });
});
