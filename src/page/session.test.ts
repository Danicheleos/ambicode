import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CountingIds, FakeClock } from '../testing/page-harness.ts';
import { SessionStore } from './session.ts';

function store(clock = new FakeClock()): SessionStore {
  return new SessionStore({ ids: new CountingIds('s-'), clock, sessionTtlMs: 60_000 });
}

describe('redeeming the link token', () => {
  it('accepts the issued value on every visit, each opening its own session', () => {
    const clock = new FakeClock();
    const sessions = store(clock);
    const capability = sessions.issueCapability();
    const first = sessions.redeemCapability(capability);
    // Long after the browser launch: the link in chat must still open the page.
    clock.advance(25 * 60 * 1000);
    const second = sessions.redeemCapability(capability);
    assert.equal(first.kind, 'ok');
    assert.equal(second.kind, 'ok');
    assert.notEqual(first.kind === 'ok' && first.session.id, second.kind === 'ok' && second.session.id);
    assert.equal(sessions.sessionCount, 2);
  });

  it('refuses every value once the server has stopped', () => {
    const sessions = store();
    const capability = sessions.issueCapability();
    sessions.clear();
    assert.equal(sessions.redeemCapability(capability).kind, 'rejected');
  });

  it('refuses a value of the same length that differs', () => {
    const sessions = store();
    const capability = sessions.issueCapability();
    const forged = `${capability.slice(0, -1)}${capability.endsWith('x') ? 'y' : 'x'}`;
    assert.equal(forged.length, capability.length);
    assert.equal(sessions.redeemCapability(forged).kind, 'rejected');
  });

  // The link arrives as untrusted URL input. Equal in characters, unequal in
  // bytes: a comparison that assumed otherwise threw instead of refusing.
  it('refuses, rather than throwing on, a value of the same character count but more bytes', () => {
    const sessions = store();
    const capability = sessions.issueCapability();
    const wide = 'é'.repeat(capability.length);
    assert.equal(wide.length, capability.length);
    assert.notEqual(Buffer.byteLength(wide), Buffer.byteLength(capability));

    const result = sessions.redeemCapability(wide);
    assert.equal(result.kind, 'rejected');
    // The genuine link still works afterwards.
    assert.equal(sessions.redeemCapability(capability).kind, 'ok');
  });
});
