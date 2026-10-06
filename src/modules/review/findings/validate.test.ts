import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHunks } from '#platform/git/diff';
import { reviewResult } from '#testing/fixtures/review-fixture';
import { notCoveredBlock } from '../bundle/coverage-block.ts';
import { renderReport } from './report.ts';
import { validateFindings, type ValidateOptions } from './validate.ts';
import type { DiffFile } from '#types/platform/git';

const section = ['@@ -1,2 +1,3 @@', ' export const a = 1;', '-export const b = 1;', '+export const b = 2;', '+export const c = 3;'].join('\n');
const file: DiffFile = { oldPath: 'src/a.ts', newPath: 'src/a.ts', changeKind: 'modified', binary: false, addedLines: 2, removedLines: 1, hunks: parseHunks(section), patchSection: section };
const at = (line: number, path = 'src/a.ts') => ({ oldPath: path, newPath: path, side: 'new' as const, line });
const candidate = (location = at(2), extra: { ruleRefs?: string[]; requirementRefs?: string[] } = {}) => ({
  risk: 'high' as const, confidence: 'high' as const, category: 'correctness', location, supportingLocations: [], explanation: 'x', suggestedComment: `y${location.line}`, ruleRefs: [], requirementRefs: [], ...extra,
});
const run = (findings: ReturnType<typeof candidate>[], overrides: Partial<ValidateOptions> = {}) => validateFindings({
  output: { findings, coverageNotes: [] },
  files: [file],
  snapshotText: new Map([['src/a.ts', 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n']]),
  reviewId: 'r1', maxFindings: 3, knownRuleIds: new Set(['r/known']), knownRequirementIds: new Set(['REQ-1']), ...overrides,
});
const bad = [candidate(at(99)), candidate(at(2), { ruleRefs: ['r/unknown'] }), candidate(at(2), { requirementRefs: ['REQ-9'] })];

describe('validateFindings onInvalid (08-V)', () => {
  it('08-V1: absent and void behave the same and stay invalid with rejections', () => {
    const findings = [candidate(at(2)), candidate(at(99))];
    const absent = run(findings);
    assert.equal(absent.kind, 'invalid');
    assert.deepEqual(run(findings, { onInvalid: 'void' }), absent);
    assert.ok(absent.kind === 'invalid' && absent.rejections.length === 1 && !('findings' in absent));
    assert.equal(run([candidate(at(2))]).kind, 'ok');
  });

  it('08-V2: drop keeps the valid finding and drops bad location, unknown rule and unknown requirement', () => {
    const result = run([candidate(at(2)), ...bad], { onInvalid: 'drop', maxFindings: 5 });
    assert.equal(result.kind, 'partial');
    if (result.kind !== 'partial') return;
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0]?.location.line, 2);
    assert.equal(result.rejections.length, 3);
    assert.match(result.rejections.join('\n'), /line 99 is not present/);
    assert.match(result.rejections.join('\n'), /rule "r\/unknown"/);
    assert.match(result.rejections.join('\n'), /requirement "REQ-9"/);
    assert.equal(result.reason, '3 invalid finding(s) dropped (review.onInvalid: drop)');
  });

  it('08-V2: drop with nothing invalid is ok, and with nothing valid is partial with no findings', () => {
    assert.equal(run([candidate(at(2))], { onInvalid: 'drop' }).kind, 'ok');
    const all = run([candidate(at(99))], { onInvalid: 'drop' });
    assert.ok(all.kind === 'partial' && all.findings.length === 0);
  });

  it('08-V2: over maxFindings still voids under drop', () => {
    const result = run([candidate(at(2)), candidate(at(3)), candidate(at(99))], { onInvalid: 'drop', maxFindings: 2 });
    assert.equal(result.kind, 'invalid');
    assert.ok(result.kind === 'invalid' && /above the configured limit of 2/.test(result.reason));
  });

  it('08-V3: the drop reason reaches the report status line and the rejections land in part 4', () => {
    const dropped = run([candidate(at(2)), candidate(at(99))], { onInvalid: 'drop' });
    assert.ok(dropped.kind === 'partial');
    if (dropped.kind !== 'partial') return;
    const base = reviewResult();
    const result = { ...base, status: 'partial' as const, statusReason: dropped.reason, reviewer: { ...base.reviewer!, rejections: dropped.rejections } };
    const report = renderReport({ result, snapshotDirectory: '', resultPath: '', pendingApprovals: [] });
    const block = notCoveredBlock(result);
    assert.ok(report.includes(block));
    assert.match(report.split('\n')[1] ?? '', /\(partial: 1 invalid finding\(s\) dropped \(review\.onInvalid: drop\)\)/);
    assert.match(block, /line 99 is not present/);
  });
});
