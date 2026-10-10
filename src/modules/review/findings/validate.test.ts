import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHunks } from '#platform/git/diff';
import { validateFindings, type ValidateOptions } from './validate.ts';
import type { DiffFile } from '#types/platform/git';

const section = ['@@ -1,2 +1,3 @@', ' export const a = 1;', '-export const b = 1;', '+export const b = 2;', '+export const c = 3;'].join('\n');
const file: DiffFile = { oldPath: 'src/a.ts', newPath: 'src/a.ts', changeKind: 'modified', binary: false, addedLines: 2, removedLines: 1, hunks: parseHunks(section), patchSection: section };
const at = (line: number, path = 'src/a.ts') => ({ oldPath: path, newPath: path, side: 'new' as const, line });
const candidate = (location = at(2), extra: { ruleRefs?: string[]; requirementRefs?: string[] } = {}) => ({
  risk: 'high' as const, confidence: 'high' as const, category: 'correctness', location, explanation: 'x', suggestedComment: `y${location.line}`, ruleRefs: [], requirementRefs: [], ...extra,
});
const run = (findings: ReturnType<typeof candidate>[], overrides: Partial<ValidateOptions> = {}) => validateFindings({
  output: { findings, coverageNotes: [] },
  files: [file],
  snapshotText: new Map([['src/a.ts', 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n']]),
  maxFindings: 3, knownRuleIds: new Set(['r/known']), knownRequirementIds: new Set(['REQ-1']), ...overrides,
});

describe('validateFindings', () => {
  it('numbers valid findings f1, f2 and takes the evidence from the checkout text', () => {
    const result = run([candidate(at(2)), candidate(at(3))]);
    assert.ok(result.kind === 'ok');
    assert.deepEqual(result.findings.map((finding) => finding.id), ['f1', 'f2']);
    assert.match(result.findings[0]?.evidence ?? '', /2: export const b = 2; <---/);
  });

  it('one bad location, unknown rule or unknown requirement voids the whole answer', () => {
    const result = run([candidate(at(2)), candidate(at(99)), candidate(at(2), { ruleRefs: ['r/unknown'] }), candidate(at(2), { requirementRefs: ['REQ-9'] })], { maxFindings: 5 });
    assert.equal(result.kind, 'invalid');
    if (result.kind !== 'invalid') return;
    assert.equal(result.rejections.length, 3);
    assert.match(result.rejections.join('\n'), /line 99 is not present/);
    assert.match(result.rejections.join('\n'), /rule "r\/unknown"/);
    assert.match(result.rejections.join('\n'), /requirement "REQ-9"/);
  });

  it('over maxFindings voids the answer', () => {
    const result = run([candidate(at(2)), candidate(at(3)), candidate(at(2))], { maxFindings: 2 });
    assert.ok(result.kind === 'invalid' && /above the configured limit of 2/.test(result.reason));
  });

  it('a new-side path missing from the checkout text falls back to the diff line', () => {
    const result = run([candidate(at(2))], { snapshotText: new Map() });
    assert.ok(result.kind === 'ok');
    assert.match(result.findings[0]?.evidence ?? '', /export const b = 2;/);
  });
});
