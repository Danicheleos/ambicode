import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { finalTextOf, foundPaths, metricsOf, normalize, scoreFiles } from './metrics.mjs';

const SPEC = { source: 'files-section', relevant: ['src/a.ts', 'src/b.ts', 'tests/a.test.ts'], allowed: ['src/c.ts'] };
const say = (text, parent = null) => JSON.stringify({ type: 'assistant', parent_tool_use_id: parent, message: { content: [{ type: 'text', text }] } });

describe('evals retrieval metrics', () => {
  it('paths become repository-relative: ./, a leading repo/ and an absolute sandbox prefix are dropped', () => {
    assert.equal(normalize('repo/src/a.ts'), 'src/a.ts');
    assert.equal(normalize('/private/tmp/e-1/home/cwd/repo/src/a.ts'), 'src/a.ts');
    assert.equal(normalize('./src/a.ts'), 'src/a.ts');
  });

  it('the files section is read up to the next heading; files ruled out above it do not count', () => {
    const text = 'src/x.ts does not change.\n\n## Files\n- `repo/src/a.ts`\n- src/c.ts\n\n## Notes\nsrc/d.ts';
    assert.deepEqual(foundPaths(text, 'files-section'), ['src/a.ts', 'src/c.ts']);
    assert.equal(foundPaths('no section here: src/a.ts', 'files-section'), null);
  });

  it('citations are only paths with a line, so a file named to rule it out is not counted', () => {
    assert.deepEqual(foundPaths('`total` in `src/a.ts:3-6`; **`src/b.ts:1`**. src/legacy.ts is retired.', 'citations'), ['src/a.ts', 'src/b.ts']);
  });

  it('recall over the relevant files, precision with allowed files neither hit nor miss, F1 between them', () => {
    const score = scoreFiles(SPEC, ['src/a.ts', 'src/c.ts', 'src/decoy.ts']);
    assert.equal(score.recall, 0.333);
    assert.equal(score.precision, 0.667);
    assert.equal(score.f1, 0.444);
    assert.deepEqual(score.missed, ['src/b.ts', 'tests/a.test.ts']);
    assert.deepEqual(score.extra, ['src/decoy.ts']);
  });

  it('a run without the Files section breaks the contract: recall and F1 0, precision undefined', () => {
    assert.deepEqual(scoreFiles(SPEC, null), { found: null, missed: SPEC.relevant, extra: [], recall: 0, precision: null, f1: 0, contract: false });
  });

  it('no relevant files (a question about code that does not exist): recall is undefined and any cited file is an extra', () => {
    const score = scoreFiles({ source: 'citations', relevant: [], allowed: [] }, ['src/ws.ts']);
    assert.equal(score.recall, null);
    assert.equal(score.precision, 0);
  });

  it('the answer is the main session\'s last text; subagent text is not', () => {
    const trace = [say('first'), say('## Files\nsrc/a.ts'), say('subagent says src/z.ts:1', 'toolu_1')].join('\n');
    assert.equal(finalTextOf(trace), '## Files\nsrc/a.ts');
    assert.equal(metricsOf(SPEC, trace).recall, 0.333);
  });
});
