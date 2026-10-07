import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { csrfMatches, csrfTokenFor, readCookie, signValue, unsignValue } from './cookies.ts';

describe('page cookies', () => {
  it('a signed value unsigns under its secret only, and a tampered one does not', () => {
    const signed = signValue('s1', 'session-1');
    assert.deepEqual(unsignValue('s1', signed), { valid: true, value: 'session-1' });
    assert.equal(unsignValue('s2', signed).valid, false);
    assert.equal(unsignValue('s1', signed.replace('session-1', 'session-2')).valid, false);
    assert.equal(unsignValue('s1', 'nodot').valid, false);
  });

  it('the form token is bound to the session and the secret', () => {
    const token = csrfTokenFor('s1', 'a');
    assert.equal(csrfMatches('s1', 'a', token), true);
    assert.equal(csrfMatches('s1', 'b', token), false);
    assert.equal(csrfMatches('s2', 'a', token), false);
    assert.equal(csrfMatches('s1', 'a', undefined), false);
  });

  it('reads one cookie from the header', () => {
    assert.equal(readCookie('a=1; ambicode_session=x.y%3D; b=2', 'ambicode_session'), 'x.y=');
    assert.equal(readCookie(undefined, 'a'), undefined);
    assert.equal(readCookie('a=%E0%A4%A', 'a'), undefined);
  });
});
