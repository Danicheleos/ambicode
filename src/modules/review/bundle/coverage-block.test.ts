import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reviewResult } from '#testing/fixtures/review-fixture';
import { containsBlock, normalizeBlock, notCoveredBlock } from './coverage-block.ts';
import { renderReport } from '../findings/report.ts';

const HEADING = '4. OMISSIONS, UNCERTAINTY AND UNAVAILABLE COVERAGE';

describe('notCoveredBlock (08-C1)', () => {
  it('08-C1: equals part 4 of the full report for a result with gaps, omissions and rejections', () => {
    const base = reviewResult({ coverageComplete: false });
    const result = { ...base, omissions: ['om one', 'om two'], reviewer: { ...base.reviewer!, rejections: ['finding 1 (a.ts:9 new): rejected'] } };
    const report = renderReport({ result, snapshotDirectory: '/snap', resultPath: '/res', pendingApprovals: [] });
    const block = notCoveredBlock(result);
    assert.equal(block, report.slice(report.indexOf(HEADING)));
    assert.ok(block.startsWith(HEADING));
    assert.match(block, /coverage    1 file\(s\) delivered of 4 declared/);
    assert.match(block, /- om two/);
    assert.match(block, /- finding 1 \(a\.ts:9 new\): rejected/);
  });

  it('08-C1: states "(none recorded)" for a result without omissions or rejections', () => {
    const base = reviewResult();
    assert.match(notCoveredBlock({ ...base, omissions: [] }), /\(none recorded\)$/);
  });
});

describe('normalizeBlock and containsBlock (08-C2)', () => {
  it('08-C2: normalizeBlock trims, collapses inner whitespace, drops empty lines and accepts CRLF', () => {
    assert.deepEqual(normalizeBlock('  a   b \r\n\r\n\t c\td\n   \n'), ['a b', 'c d']);
    assert.deepEqual(normalizeBlock(''), []);
  });

  const block = `${HEADING}\n   - one\n   - two`;

  it('08-C2: a block is contained despite indentation, wrapping blank lines and line endings', () => {
    const message = `intro\r\n\r\n4.  OMISSIONS, UNCERTAINTY AND UNAVAILABLE COVERAGE\r\n- one\r\n\r\n    - two   \r\nouter`;
    assert.ok(containsBlock(message, block));
  });

  it('08-C2: a contiguous run is required: an interleaved line fails', () => {
    assert.equal(containsBlock(`${HEADING}\n- one\nextra\n- two`, block), false);
  });

  it('08-C2: a reordered or partial block fails', () => {
    assert.equal(containsBlock(`${HEADING}\n- two\n- one`, block), false);
    assert.equal(containsBlock(`${HEADING}\n- one`, block), false);
  });

  it('08-C2: an empty block is always contained', () => {
    assert.ok(containsBlock('anything', '  \n'));
  });
});
