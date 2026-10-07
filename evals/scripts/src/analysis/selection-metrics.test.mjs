import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { acceptedRate, selectionReport, selectionTotals } from './selection-metrics.mjs';

const row = (offered, selected, posted) => JSON.stringify({ at: '2026-10-06T00:00:00Z', reviewId: 'r', findingId: 'f', rule: null, offered, selected, edited: false, posted });

describe('selection metrics aggregator', () => {
  it('08-M5: counts offered, selected and posted, and the accepted rate is posted / offered', () => {
    const totals = selectionTotals([row(true, true, true), row(true, true, false), row(true, false, false), row(false, false, false)].join('\n'));
    assert.deepEqual(totals, { rows: 4, offered: 3, selected: 2, posted: 1, unparsable: 0 });
    assert.equal(acceptedRate(totals), '0.333');
  });

  it('08-M5: the accepted rate is n/a when nothing was offered', () => {
    assert.equal(acceptedRate(selectionTotals(row(false, false, false))), 'n/a');
    assert.equal(acceptedRate(selectionTotals('')), 'n/a');
  });

  it('08-M5: unparsable and non-row lines are counted and reported, never used', () => {
    const totals = selectionTotals([row(true, true, true), '{not json', '{"offered":"yes"}', 'null', ''].join('\n'));
    assert.deepEqual(totals, { rows: 1, offered: 1, selected: 1, posted: 1, unparsable: 3 });
    const [line] = selectionReport(['/repo'], { read: () => [row(true, false, false), 'garbage'].join('\n') });
    assert.equal(line, '/repo: offered 1, selected 0, posted 0, accepted rate 0.000, 1 unparsable line(s) skipped');
  });

  it('08-M5: prints one line per repository from <repo>/.ambicode/metrics.jsonl; a repository without it says so', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'selection-metrics-'));
    try {
      const withMetrics = path.join(dir, 'a');
      mkdirSync(path.join(withMetrics, '.ambicode'), { recursive: true });
      writeFileSync(path.join(withMetrics, '.ambicode', 'metrics.jsonl'), `${row(true, true, true)}\n${row(true, true, false)}\n`);
      const without = path.join(dir, 'b');
      mkdirSync(without);
      const script = fileURLToPath(new URL('./selection-metrics.mjs', import.meta.url));
      const out = execFileSync(process.execPath, [script, withMetrics, without], { encoding: 'utf8' }).trim().split('\n');
      assert.deepEqual(out, [
        `${withMetrics}: offered 2, selected 2, posted 1, accepted rate 0.500`,
        `${without}: no ${path.join('.ambicode', 'metrics.jsonl')}`,
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
