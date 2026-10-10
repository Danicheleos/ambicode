import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { deliverOnce, resetDelivered } from './hook-state.ts';

describe('hook state: one marker per delivery kind', () => {
  it('delivers a value once, again when it changes, and again after a reset', async () => {
    const base = await mkdtemp(path.join(tmpdir(), 'hook-state-'));
    try {
      assert.equal(await deliverOnce(nodeFileSystem, base, 'route-step', 'r1:read'), true);
      assert.equal(await deliverOnce(nodeFileSystem, base, 'route-step', 'r1:read'), false);
      assert.equal(await deliverOnce(nodeFileSystem, base, 'route-step', 'r1:write'), true);
      assert.equal(await deliverOnce(nodeFileSystem, base, 'route-step', 'r1:read'), true, 'only the latest value counts');
      assert.equal(await deliverOnce(nodeFileSystem, base, 'stop-seen', 'r1'), true, 'kinds do not share a marker');
      await resetDelivered(nodeFileSystem, base);
      assert.equal(await deliverOnce(nodeFileSystem, base, 'stop-seen', 'r1'), true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
