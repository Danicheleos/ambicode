import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { offersOption, stripRecommended } from './gates.ts';

describe('a trailing "(Recommended)" on an answer label', () => {
  it('is removed, and the option it names is offered', () => {
    assert.equal(stripRecommended('app (Recommended)'), 'app');
    assert.equal(stripRecommended('Accept'), 'Accept');
    assert.equal(offersOption('project-ambiguous', ['app', 'stop'], 'app (Recommended)'), true);
    assert.equal(offersOption('project-ambiguous', ['app', 'stop'], 'other (Recommended)'), false);
  });
});
