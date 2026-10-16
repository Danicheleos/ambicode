import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HANDLER_NAMES } from '#types/harness';
import { skillHandlers } from './handlers.ts';

test('the handler table registers exactly the names routes may use', () => {
  assert.deepEqual(Object.keys(skillHandlers()).sort(), [...HANDLER_NAMES].sort());
});
