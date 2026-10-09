import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { answerShape, answerShapeProblems, SHAPE_MAX_BYTES, SHAPE_MAX_LINES } from './answer-shape.ts';

const answer = (...files: string[]): string => `## Evidence\n- src/a.ts:1-9 does X\n\n## Files\n${files.join('\n')}\n`;

describe('answer-shape', () => {
  it('R1: a change path no receipt served is "not read"; a served span counts; a creation is exempt', () => {
    const text = answer('- `src/a.ts`', '- `src/b.ts`', '- `src/c.ts` (new file)', '- `src/d.ts` would be created');
    assert.deepEqual(answerShapeProblems({ answer: text, served: ['src/a.ts:10-20'] }), ['not read: src/b.ts']);
    assert.deepEqual(answerShapeProblems({ answer: text, served: ['src/a.ts:1-3', 'src/b.ts:1-3'] }), []);
  });

  it('R1 applies with no receipts at all: every existing change path is "not read"', () => {
    assert.deepEqual(answerShape({ answer: answer('- src/a.ts', '- src/b.ts'), served: [] }).notRead, ['src/a.ts', 'src/b.ts']);
  });

  it('R1 leaves "(new method)" on an existing file subject to the read rule', () => {
    assert.deepEqual(answerShape({ answer: answer('- src/a.ts (new method)'), served: [] }).notRead, ['src/a.ts']);
  });

  it('R2: a hedged change line, or a hedge in its nested lines, is "undecided"', () => {
    const text = answer('- `src/a.ts`: only if the mapping changes', '- `src/b.ts`', '  - I did not read it', '- `src/c.ts`: the core change');
    const served = ['src/a.ts:1-2', 'src/b.ts:1-2', 'src/c.ts:1-2'];
    assert.deepEqual(answerShapeProblems({ answer: text, served }), ['undecided: src/a.ts', 'undecided: src/b.ts']);
  });

  it('R2: a decided exclusion is not a change line, so a hedge in it is not reported', () => {
    const text = answer('- `src/a.ts`', 'Files that need no change:', '- `src/z.ts` (optional)');
    assert.deepEqual(answerShapeProblems({ answer: text, served: ['src/a.ts:1-2'] }), []);
  });

  it('is silent when every change is served and decided and every lead is named', () => {
    assert.deepEqual(answerShapeProblems({ answer: answer('- src/a.ts'), served: ['src/a.ts:1-9'] }), []);
  });

  it('a citation outside `## Files` is not a decision for R1', () => {
    assert.deepEqual(answerShape({ answer: answer('- src/b.ts'), served: ['src/a.ts:1-9'] }).notRead, ['src/b.ts']);
  });

  it('an answer with no Files section has no decisions to check', () => {
    assert.deepEqual(answerShape({ answer: 'Change src/a.ts only if needed.', served: [] }), { notRead: [], undecided: [] });
  });

  it('caps the lines and bytes, rule 1 first', () => {
    const files = Array.from({ length: 30 }, (_, i) => `- src/dir/file-with-a-longer-name-${i}.ts`);
    const lines = answerShapeProblems({ answer: answer(...files), served: [] });
    assert.ok(lines.length <= SHAPE_MAX_LINES);
    assert.ok(Buffer.byteLength(lines.join('\n')) <= SHAPE_MAX_BYTES);
    assert.ok(lines.every((line) => line.startsWith('not read: ')));
  });
});
