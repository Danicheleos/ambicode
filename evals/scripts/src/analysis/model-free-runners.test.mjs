import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dryRunArgs } from './model-free-runners.mjs';

describe('model-free runners', () => {
  it('a runner always plans: dry-run is forced and the model and cap get defaults', () => {
    assert.deepEqual(dryRunArgs(['--set', 'task'], []), ['--set', 'task', '--dry-run', '--model', 'claude-sonnet-5-5', '--max-cost-usd', '1']);
    assert.deepEqual(dryRunArgs(['--set', 'task'], ['--model', 'm', '--max-cost-usd', '3', '--dry-run']), ['--set', 'task', '--dry-run', '--model', 'm', '--max-cost-usd', '3']);
  });
});
