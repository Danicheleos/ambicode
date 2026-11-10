import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { holdsWords, stem } from './words.ts';

describe('stem', () => {
  it('a word that merely starts like another does not meet it', () => {
    assert.equal(holdsWords('user-facade.mocks.ts', 'faces'), false);
    assert.equal(holdsWords('user-facade.mocks.ts', 'facing'), false);
  });

  it('meets a path word with every form of its family', () => {
    for (const form of ['archive', 'archived', 'archiving']) assert.equal(holdsWords('src/archive/list.ts', form), true, form);
    assert.equal(holdsWords('src/complete-form.ts', 'completed'), true);
    assert.equal(holdsWords('src/files/list.ts', 'file'), true);
    for (const [word, form] of [['class', 'classes'], ['status', 'statuses']]) assert.equal(holdsWords(`src/${form}/list.ts`, word), true, `${word}/${form}`);
  });

  const same = ([a, b]: readonly [string, string]) => stem(a) === stem(b);

  it('gives forms of one word a shared stem', () => {
    const good: [string, string][] = [['version', 'versions'], ['employee', 'employees'], ['cancel', 'cancelling'], ['validate', 'validation'], ['complete', 'completing'], ['recognition', 'recognitions'], ['story', 'stories'], ['item', 'items'], ['face', 'faces'], ['create', 'created'], ['entry', 'entries'], ['submit', 'submitted'], ['report', 'reports'], ['filter', 'filtering']];
    for (const pair of good) assert.equal(same(pair), true, pair.join('/'));
  });

  it('keeps unrelated words apart', () => {
    const bad: [string, string][] = [['reset', 'resize'], ['content', 'context'], ['access', 'accessor'], ['recall', 'record'], ['form', 'format'], ['workflow', 'work'], ['time', 'timeline'], ['data', 'database'], ['tool', 'tooltip'], ['read', 'readonly'], ['story', 'storybook'], ['value', 'valid'], ['user', 'username'], ['spec', 'specific'], ['port', 'portal'], ['item', 'itemize']];
    for (const pair of bad) assert.equal(same(pair), false, pair.join('/'));
  });

  it.todo('base and based share a stem (they give base and based: the 4-letter floor blocks the -ed cut)');
  it.todo('state and stats stay apart (today they share a stem)');
  it.todo('local and locale stay apart (today they share a stem)');
  it.todo('copies and copy share a stem');
});
