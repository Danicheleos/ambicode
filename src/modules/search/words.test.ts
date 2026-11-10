import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { holdsWords, stem } from './words.ts';

describe('stem', () => {
  it('keeps at least four letters, so a short stem does not match an unrelated word', () => {
    assert.deepEqual(['faces', 'facing', 'face', 'facade'].map(stem), ['face', 'facing', 'face', 'facad']);
    assert.equal(holdsWords('user-facade.mocks.ts', 'faces'), false);
    assert.equal(holdsWords('user-facade.mocks.ts', 'facing'), false);
  });

  it('unifies a word family and leaves double-s words whole', () => {
    assert.deepEqual(['complete', 'completed'].map(stem), ['complet', 'complet']);
    assert.equal(new Set(['archive', 'archived', 'archiving'].map(stem)).size, 1);
    assert.deepEqual(['files', 'assess'].map(stem), ['file', 'assess']);
  });

  it('meets a path word with every form of its family', () => {
    for (const form of ['archive', 'archived', 'archiving']) assert.equal(holdsWords('src/archive/list.ts', form), true, form);
    assert.equal(holdsWords('src/complete-form.ts', 'completed'), true);
    assert.equal(holdsWords('src/files/list.ts', 'file'), true);
  });
});
