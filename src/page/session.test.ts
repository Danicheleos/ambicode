import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CountingIds, FakeClock } from '../testing/page-harness.ts';
import { SessionStore } from './session.ts';

function store(): SessionStore {
  return new SessionStore({ ids: new CountingIds('s-'), clock: new FakeClock(), sessionTtlMs: 60_000 });
}

describe('consuming the one-time capability', () => {
  it('accepts the issued value once', () => {
    const sessions = store();
    const capability = sessions.issueCapability();
    assert.equal(sessions.consumeCapability(capability).kind, 'ok');
    assert.equal(sessions.consumeCapability(capability).kind, 'rejected');
  });

  it('refuses a value of the same length that differs', () => {
    const sessions = store();
    const capability = sessions.issueCapability();
    const forged = `${capability.slice(0, -1)}${capability.endsWith('x') ? 'y' : 'x'}`;
    assert.equal(forged.length, capability.length);
    assert.equal(sessions.consumeCapability(forged).kind, 'rejected');
  });

  // The link arrives as untrusted URL input. Equal in characters, unequal in
  // bytes: a comparison that assumed otherwise threw instead of refusing.
  it('refuses, rather than throwing on, a value of the same character count but more bytes', () => {
    const sessions = store();
    const capability = sessions.issueCapability();
    const wide = 'é'.repeat(capability.length);
    assert.equal(wide.length, capability.length);
    assert.notEqual(Buffer.byteLength(wide), Buffer.byteLength(capability));

    const result = sessions.consumeCapability(wide);
    assert.equal(result.kind, 'rejected');
    // The genuine link still works afterwards.
    assert.equal(sessions.consumeCapability(capability).kind, 'ok');
  });
});
