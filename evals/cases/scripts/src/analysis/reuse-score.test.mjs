import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bullets, scoreReuse } from './reuse-score.mjs';

const EXPORTS = { Risk: ['a.ts'], RiskLevel: ['b.ts'], checkReadPerm: ['c.ts'], Duration: ['d.ts'] };
const ANSWER = [
  'Intro prose with `Risk` outside any section.',
  '## Reuse',
  '- `src/a.ts`: `Risk` — the enum',
  '- `src/c.ts`: `checkReadPerm()` — middleware',
  '- `src/z.ts`: `Invented` — not real',
  '## New',
  '- `risk_level` — same as RiskLevel',
  '- `BrandNewThing` — really new',
  '## Notes',
  '- `Duration`',
].join('\n');

describe('reuse-score', () => {
  it('reads backticked names per bullet and sets paths aside', () => {
    assert.deepEqual(bullets(ANSWER, 'reuse')[1], { names: ['checkReadPerm'], files: ['src/c.ts'] });
    assert.deepEqual(bullets('## Reuse\n- `Foo.bar()` — x\n', 'reuse')[0].names, ['Foo', 'bar']);
    assert.equal(bullets('no sections', 'reuse'), null);
  });

  it('counts recall over the real change\'s imports, precision over real symbols, and duplicates among the new', () => {
    const s = scoreReuse(ANSWER, ['Risk', 'checkReadPerm', 'Duration'], EXPORTS);
    assert.equal(s.recall, 2 / 3);
    assert.equal(s.precision, 2 / 3);
    assert.equal(s.dupes, 1, 'risk_level is RiskLevel under another spelling');
    assert.equal(s.created, 2);
  });

  it('scores an answer with no Reuse section as nothing found', () => {
    assert.deepEqual(scoreReuse('prose', ['Risk'], EXPORTS), { precision: 0, recall: 0, f1: 0, hit: 0, named: 0, dupes: 0, sectioned: false });
  });
});
