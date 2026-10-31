import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasRequirement } from '#modules/requirements/capture/has-requirement';
import { iterationOf, mintTaskSlug } from './slug.ts';

describe('mintTaskSlug names a task from the request alone', () => {
  it('gives the same slug for the same words in any case or punctuation', () => {
    const a = mintTaskSlug('How does the order total validation work?');
    assert.equal(a, 'how-does-the-order-total-validation-work');
    assert.equal(mintTaskSlug('how does the Order Total validation work'), a);
    assert.equal(mintTaskSlug('which files? ORD-17'), 'ord-17', 'an issue key names the task');
    assert.equal(mintTaskSlug('https://example.atlassian.net/browse/ABC-123'), 'abc-123');
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

describe('only an uppercase project key names a task, and the requirement check agrees', () => {
  it('names the task by ORD-17 and by nothing lowercase', () => {
    assert.equal(mintTaskSlug('ORD-17 add totals'), 'ord-17');
    assert.equal(mintTaskSlug('utf-8 decoding fails'), 'utf-8-decoding-fails');
    assert.equal(mintTaskSlug('es-2022 target'), 'es-2022-target');
    assert.equal(mintTaskSlug('hash it with sha-256 and utf-8'), 'hash-it-with-sha-256-and-utf-8');
    assert.equal(mintTaskSlug('add totals, see ord-17'), 'add-totals-see-ord-17');
  });

  it('fetches a ticket exactly when the first word names the task by its key', () => {
    for (const text of ['ORD-17 add totals', 'ord-17 add totals', 'abc-123 add totals', 'utf-8 decoding fails']) {
      const named = mintTaskSlug(text) === text.split(' ')[0]!.toLowerCase();
      assert.equal(hasRequirement({ text, requirements: [], headless: false }, { mcpServer: 'jira' }), named, text);
    }
  });
});

describe('iterationOf reads the iteration once, from the request and the task it named', () => {
  it('reads `iteration N` anywhere and a bare number right after the task word', () => {
    assert.equal(iterationOf('fix totals Iteration 2', 'fix-totals'), 2);
    assert.equal(iterationOf('ORD-17 1', 'ord-17'), 1);
    assert.equal(iterationOf('ord-17   2', 'ord-17'), 2);
    assert.equal(iterationOf('https://x.atlassian.net/browse/ABC-123 3', 'abc-123'), 3);
    assert.equal(iterationOf('.ambicode/tasks/ord-17 2', 'ord-17'), 2);
  });

  it('reads a bare number only as the whole remainder after the task word, or as the whole text of a named task', () => {
    assert.equal(iterationOf('ORD-17 2 failing tests to fix', 'ord-17'), null);
    assert.equal(iterationOf('ORD-17 2026 roadmap', 'ord-17'), null);
    assert.equal(iterationOf('ORD-17 2026 roadmap iteration 3', 'ord-17'), 3);
    assert.equal(iterationOf('2', 'ord-17'), 2);
    assert.equal(iterationOf('2026 roadmap', 'ord-17'), null);
    assert.equal(iterationOf('2', '2'), null, 'text that only names its own task is not an iteration');
  });

  it('is null when the number is not next to the task word', () => {
    assert.equal(iterationOf('ORD-17', 'ord-17'), null);
    assert.equal(iterationOf('ORD-17 add 2 totals', 'ord-17'), null);
    assert.equal(iterationOf('add 2', 'add-2'), null, 'a slug minted from the text has no task word');
    assert.equal(iterationOf('ORD-17 2x', 'ord-17'), null);
  });
});
