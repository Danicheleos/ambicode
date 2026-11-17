import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchOption } from './gates.ts';

describe('an answer label is matched to the declared option', () => {
  it('drops a trailing "(Recommended)" and finds the option', () => {
    assert.equal(matchOption(['app', 'stop'], 'app (Recommended)'), 'app');
    assert.equal(matchOption(['app', 'stop'], 'other (Recommended)'), null);
  });

  it('ignores case and surrounding space and returns the declared spelling', () => {
    assert.equal(matchOption(['use these sources', 'none — stop'], '  Use These Sources '), 'use these sources');
    assert.equal(matchOption(['use these sources'], 'USE THESE SOURCES (Recommended)'), 'use these sources');
    assert.equal(matchOption(['Accept'], 'Accept'), 'Accept');
  });

  it('matches the label before " — " of an option, unless two options share it', () => {
    assert.equal(matchOption(['use these sources', 'none — stop'], 'none'), 'none — stop');
    assert.equal(matchOption(['use these sources', 'none — stop'], 'None (Recommended)'), 'none — stop');
    assert.equal(matchOption(['use these sources', 'none — stop'], 'stop'), null);
    assert.equal(matchOption(['a — x', 'a — y'], 'a'), null);
  });
});
