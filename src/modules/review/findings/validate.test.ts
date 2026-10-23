import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHunks } from '#platform/git/diff';
import { ReviewerOutput } from '#types/modules/review';
import { validateFindings, type ValidateOptions } from './validate.ts';
import type { DiffFile } from '#types/platform/git';

const section = ['@@ -1,2 +1,3 @@', ' export const a = 1;', '-export const b = 1;', '+export const b = 2;', '+export const c = 3;'].join('\n');
const file: DiffFile = { oldPath: 'src/a.ts', newPath: 'src/a.ts', changeKind: 'modified', binary: false, addedLines: 2, removedLines: 1, hunks: parseHunks(section), patchSection: section };
const at = (line: number, path = 'src/a.ts') => ({ oldPath: path, newPath: path, side: 'new' as const, line });
const candidate = (location = at(2), extra: { ruleRefs?: string[]; requirementRefs?: string[]; supportingLocations?: ReturnType<typeof at>[] } = {}) => ({
  risk: 'high' as const, confidence: 'high' as const, category: 'correctness', location, problem: 'x', impact: 'i', confidenceReason: 'c', suggestedComment: `y${location.line}`, ruleRefs: [], requirementRefs: [], supportingLocations: [] as ReturnType<typeof at>[], ...extra,
});
const run = (findings: ReturnType<typeof candidate>[], overrides: Partial<ValidateOptions> = {}) => validateFindings({
  output: { findings, requirementCoverage: [], coverageNotes: [] },
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

  it('a bad location drops only that finding and lists it; the rest is kept', () => {
    const result = run([candidate(at(2)), candidate(at(99)), candidate(at(3))], { maxFindings: 5 });
    assert.ok(result.kind === 'ok');
    assert.deepEqual(result.findings.map((finding) => finding.id), ['f1', 'f2']);
    assert.equal(result.rejected.length, 1);
    assert.match(result.rejected[0] ?? '', /finding 2 \(src\/a\.ts:99 new\): line 99 is not present/);
  });

  it('supporting locations are checked like the main one: a valid one is kept once, an invalid one or a repeat of the main one is dropped, and the drop is noted', () => {
    const result = run([candidate(at(2), { supportingLocations: [at(3), at(3), at(2), at(99)] })]);
    assert.ok(result.kind === 'ok');
    assert.deepEqual(result.findings[0]?.supportingLocations, [at(3)]);
    assert.equal(result.dropped.length, 1);
    assert.match(result.dropped[0] ?? '', /finding 1 \(src\/a\.ts:2 new\) also named src\/a\.ts:99 new: line 99 is not present.*dropped/);
  });

  it('an answer whose findings are all at bad locations is invalid, not clean', () => {
    const result = run([candidate(at(98)), candidate(at(99))], { maxFindings: 5 });
    assert.equal(result.kind, 'invalid');
    if (result.kind !== 'invalid') return;
    assert.equal(result.rejections.length, 2);
  });

  it('an unknown requirement ref is dropped with a note and the finding is kept', () => {
    const result = run([candidate(at(2), { requirementRefs: ['REQ-9'] })]);
    assert.ok(result.kind === 'ok');
    assert.equal(result.findings.length, 1);
    assert.deepEqual(result.findings[0]?.requirementRefs, []);
    assert.match(result.dropped.join('\n'), /cited requirement "REQ-9".*dropped/);
  });

  it('a requirement ref that is the key at the tail of a known id resolves to that id', () => {
    const result = run([candidate(at(2), { requirementRefs: ['VS-6876', 'https://x.example/browse/VS-6876'] })], { knownRequirementIds: new Set(['https://x.example/browse/VS-6876']) });
    assert.ok(result.kind === 'ok');
    assert.deepEqual(result.findings[0]?.requirementRefs, ['https://x.example/browse/VS-6876']);
    assert.equal(result.dropped.length, 0);
  });

  it('a paragraph where one sentence is asked for is clipped with an ellipsis, not refused', () => {
    const long = 'w'.repeat(500);
    const result = run([{ ...candidate(at(2)), problem: long, impact: 'short', confidenceReason: long }]);
    assert.ok(result.kind === 'ok');
    assert.equal(result.findings[0]?.problem.length, 300);
    assert.ok(result.findings[0]?.problem.endsWith('…'));
    assert.equal(result.findings[0]?.impact, 'short');
  });

  it('requirement rows resolve their ref like requirementRefs and link a kept finding by its position; an unknown ref drops the row with a note', () => {
    const id = 'https://x.example/browse/VS-1';
    const output = {
      findings: [candidate(at(99)), candidate(at(2))],
      requirementCoverage: [
        { ref: 'VS-1', point: 'sums', status: 'missed' as const, note: 'n', finding: 2 },
        { ref: id, point: 'rounds', status: 'covered' as const, note: '' },
        { ref: 'VS-1', point: 'drops', status: 'missed' as const, note: '', finding: 1 },
        { ref: 'NOPE-9', point: 'ghost', status: 'covered' as const, note: '' },
      ],
      coverageNotes: [],
    };
    const result = validateFindings({ output, files: [file], snapshotText: new Map(), maxFindings: 5, knownRuleIds: new Set(), knownRequirementIds: new Set([id]) });
    assert.ok(result.kind === 'ok');
    assert.deepEqual(result.coverage.map((point) => [point.ref, point.point, point.finding]), [[id, 'sums', 'f1'], [id, 'rounds', null], [id, 'drops', null]]);
    assert.match(result.dropped.join('\n'), /requirement point "ghost" cited requirement "NOPE-9"/);
  });

  it('an unknown rule is dropped, the finding is kept, one omission is recorded', () => {
    const result = run([candidate(at(2), { ruleRefs: ['r/known', 'r/unknown'] })]);
    assert.ok(result.kind === 'ok');
    assert.equal(result.findings.length, 1);
    assert.deepEqual(result.findings[0]?.ruleRefs, ['r/known']);
    assert.equal(result.dropped.length, 1);
    assert.match(result.dropped[0] ?? '', /finding 1 \(src\/a\.ts:2 new\) cited rule "r\/unknown".*the reference was dropped/);
  });

  it('a finding citing only unknown rules is kept with no rule refs (C3: common-rules/callers)', () => {
    const result = run([candidate(at(2), { ruleRefs: ['common-design/scope', 'common-rules/callers'] })], { knownRuleIds: new Set(['common-design/scope']) });
    assert.ok(result.kind === 'ok');
    assert.deepEqual(result.findings[0]?.ruleRefs, ['common-design/scope']);
    assert.equal(result.dropped.length, 1);
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

  it('keeps a complete answer whose covered rows carry "finding": null, as the reviewer wrote them on MR 2756', () => {
    // Trimmed from that review's rejected-output.txt: 5 rows, `finding: null` on every row that is not a finding.
    const answer = {
      findings: [{
        risk: 'high', confidence: 'medium', category: 'correctness',
        location: { oldPath: null, newPath: 'main/features/score-types/hal/services/hal-input-type/hal-input-type.ts', side: 'new', line: 6 },
        supportingLocations: [], problem: 'isHalOverridden only checks cvOverrides.hal.', impact: 'A legacy-overridden assessment shows AI.', confidenceReason: 'The diff shows only the new hal field being read.',
        suggestedComment: 'Please also treat legacy originals as overridden.', ruleRefs: [], requirementRefs: ['VS-6745'],
      }],
      requirementCoverage: [
        { ref: 'VS-6759', point: 'NPF and HAL headings with tooltips in wizard', status: 'covered', note: 'Headings and help buttons added behind the flag.', finding: null },
        { ref: 'VS-6745', point: 'Legacy handSpeedRMS originals count as overridden', status: 'missed', note: 'Only hal is read.', finding: 1 },
        { ref: 'VS-6745', point: 'BFF returns the new field', status: 'cannot-verify', note: 'No BFF code in the diff.', finding: null },
      ],
      coverageNotes: [],
    };
    const parsed = ReviewerOutput.safeParse(answer);
    assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
    assert.deepEqual(parsed.data.requirementCoverage.map((row) => row.finding ?? null), [null, 1, null]);
  });
});
