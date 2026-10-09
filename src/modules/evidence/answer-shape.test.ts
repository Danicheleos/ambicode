import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { answerShape, companion, answerShapeProblems, SHAPE_MAX_BYTES, SHAPE_MAX_LINES } from './answer-shape.ts';

const answer = (...files: string[]): string => `## Evidence\n- src/a.ts:1-9 does X\n\n## Files\n${files.join('\n')}\n`;

describe('answer-shape', () => {
  it('R1: a change path no receipt served is "not read"; a served span counts; a creation is exempt', () => {
    const text = answer('- `src/a.ts`', '- `src/b.ts`', '- `src/c.ts` (new file)', '- `src/d.ts` would be created');
    assert.deepEqual(answerShapeProblems({ answer: text, served: ['src/a.ts:10-20'] }), ['not read: src/b.ts']);
    assert.deepEqual(answerShapeProblems({ answer: text, served: ['src/a.ts:1-3', 'src/b.ts:1-3'] }), []);
  });

  it('R1: a served companion (same directory, same stem) covers the change path; another file in the directory, or the stem elsewhere, does not', () => {
    const text = answer('- src/x/y.controller.spec.ts', '- src/x/y.component.html', '- src/x/other.ts', '- src/z/y.controller.ts');
    const served = ['src/x/y.controller.ts:1-80', 'src/x/y.component.ts:1-9'];
    assert.deepEqual(answerShape({ answer: text, served }).notRead, ['src/x/other.ts', 'src/z/y.controller.ts']);
    assert.deepEqual(answerShape({ answer: text, served, companions: false }).notRead, ['src/x/y.controller.spec.ts', 'src/x/y.component.html', 'src/x/other.ts', 'src/z/y.controller.ts']);
  });

  it('companion: stem is the basename up to the first dot', () => {
    assert.equal(companion('a/foo.mocks.ts', 'a/foo.ts'), true);
    assert.equal(companion('a/a.test.js', 'a/a.js'), true);
    assert.equal(companion('a/foo.ts', 'b/foo.ts'), false);
    assert.equal(companion('a/foo.ts', 'a/foobar.ts'), false);
    assert.equal(companion('a/.env', 'a/.env.local'), true);
  });

  it('inference: a line that names a served basis is covered; an unserved basis is "basis not read"; a companion of a served file is a basis', () => {
    const text = answer(
      '- src/lm-carry/carry.dto.ts \u2014 inferred from src/lm-lift/lift.dto.ts',
      '- src/lm-lower/lower.dto.ts: by analogy with src/lm-nope/nope.dto.ts',
      '- src/lm-push/push.dto.ts, mirrors `src/lm-lift/lift.dto.spec.ts`',
      '- src/lm-other/other.dto.ts',
    );
    const served = ['src/lm-lift/lift.dto.ts:1-50'];
    assert.deepEqual(answerShape({ answer: text, served }).notRead, ['src/lm-other/other.dto.ts']);
    assert.deepEqual(answerShape({ answer: text, served }).basisNotRead, [{ path: 'src/lm-lower/lower.dto.ts', basis: 'src/lm-nope/nope.dto.ts' }]);
    assert.deepEqual(answerShapeProblems({ answer: text, served }), ['not read: src/lm-other/other.dto.ts', 'basis not read: src/lm-lower/lower.dto.ts \u2190 src/lm-nope/nope.dto.ts']);
  });

  it('inference stated in the prose clears a bare Files bullet; no served basis is "basis not read"; a bare mention does not clear', () => {
    const text = [
      '## Roles',
      '- `src/lm-carry/carry.dto.ts` is inferred from `src/lm-lift/lift.dto.ts`, which was read.',
      '- `src/lm-lower/lower.dto.ts`: same change as `src/lm-nope/nope.dto.ts`.',
      '- `src/lm-push/push.dto.ts` also matters here; see the notes.',
      '',
      '## Files',
      '- src/lm-lift/lift.dto.ts',
      '- src/lm-carry/carry.dto.ts',
      '- src/lm-lower/lower.dto.ts',
      '- src/lm-push/push.dto.ts',
    ].join('\n');
    const shape = answerShape({ answer: text, served: ['src/lm-lift/lift.dto.ts:1-50'] });
    assert.deepEqual(shape.notRead, ['src/lm-push/push.dto.ts']);
    assert.deepEqual(shape.basisNotRead, [{ path: 'src/lm-lower/lower.dto.ts', basis: 'src/lm-nope/nope.dto.ts' }]);
  });

  it('inference: "inferred from the grep" names no file, so it clears nothing', () => {
    const text = '- `src/a/x.ts` (inferred from the grep): adds fields\n\n## Files\n- src/a/x.ts';
    assert.deepEqual(answerShape({ answer: text, served: [] }).notRead, ['src/a/x.ts']);
  });

  it('inference: R2 still fires on a hedged inferred line', () => {
    const text = answer('- src/lm-carry/carry.dto.ts \u2014 inferred from src/lm-lift/lift.dto.ts, only if the schema differs');
    const shape = answerShape({ answer: text, served: ['src/lm-lift/lift.dto.ts:1-9'] });
    assert.deepEqual([shape.notRead, shape.basisNotRead, shape.undecided], [[], [], ['src/lm-carry/carry.dto.ts']]);
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
    assert.deepEqual(answerShape({ answer: 'Change src/a.ts only if needed.', served: [] }), { notRead: [], basisNotRead: [], undecided: [] });
  });

  it('caps the lines and bytes, rule 1 first', () => {
    const files = Array.from({ length: 30 }, (_, i) => `- src/dir/file-with-a-longer-name-${i}.ts`);
    const lines = answerShapeProblems({ answer: answer(...files), served: [] });
    assert.ok(lines.length <= SHAPE_MAX_LINES);
    assert.ok(Buffer.byteLength(lines.join('\n')) <= SHAPE_MAX_BYTES);
    assert.ok(lines.every((line) => line.startsWith('not read: ')));
  });
});
