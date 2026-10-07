import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dryRunArgs, replaySummary, tuningSummary, tuningSummaryOf } from './model-free-runners.mjs';

const map = (hash, decisions) => ({ kind: 'map', tuning: { hash, overrides: hash === 'b' ? ['k=1'] : [] }, decisions });

describe('model-free runners', () => {
  it('summarizes tuning hashes and decisions across ledgers', () => {
    const got = tuningSummary([
      { entries: [map('a', { sequenceFiles: 1, pass2Downweighted: 2, harvestFiles: 3, feature: 'named', proseRetry: true })] },
      { entries: [map('b', { sequenceFiles: 2, pass2Downweighted: 0, harvestFiles: 1, feature: null, proseRetry: false }), { kind: 'route' }] },
    ]);
    assert.deepEqual(got.tuning, { a: { maps: 1, overrides: [] }, b: { maps: 1, overrides: ['k=1'] } });
    assert.deepEqual([got.decisions.sequenceFiles, got.decisions.harvestFiles, got.decisions.proseRetry], [3, 4, 1]);
    assert.equal(tuningSummary([{ entries: [] }]).tuning, null);
  });

  it('reads ledgers from a harvested traces directory', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tuning-'));
    mkdirSync(path.join(dir, 'ledgers', 'e-1'), { recursive: true });
    writeFileSync(path.join(dir, 'ledgers', 'e-1', 'ledger.jsonl'), `${JSON.stringify(map('a', { proseRetry: false }))}\nnot json\n`);
    assert.equal(tuningSummaryOf(dir).maps, 1);
  });

  it('summarizes recordings and names the cases without one', () => {
    const got = replaySummary({ schemaVersion: 1, recordings: [{ case: 'x', output: { findings: [{}, {}] } }, { case: 'y', output: {} }] }, ['x', 'y', 'z']);
    assert.deepEqual([got.recordings, got.cases.x.findings, got.cases.y.unreadable, got.withoutRecording], [2, 2, 1, ['z']]);
  });

  it('a runner always plans: dry-run is forced and the model and cap get defaults', () => {
    assert.deepEqual(dryRunArgs(['--set', 'task'], []), ['--set', 'task', '--dry-run', '--model', 'claude-sonnet-5-5', '--max-cost-usd', '1']);
    assert.deepEqual(dryRunArgs(['--set', 'task'], ['--model', 'm', '--max-cost-usd', '3', '--dry-run']), ['--set', 'task', '--dry-run', '--model', 'm', '--max-cost-usd', '3']);
  });
});
