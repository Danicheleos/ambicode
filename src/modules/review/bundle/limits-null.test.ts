import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHunks } from '#platform/git/diff';
import { validateFindings } from '../findings/validate.ts';
import type { DiffFile } from '#types/platform/git';

const section = ['@@ -1,1 +1,2 @@', ' export const a = 1;', '+export const b = 2;'].join('\n');
const file: DiffFile = { oldPath: 'src/a.ts', newPath: 'src/a.ts', changeKind: 'modified', binary: false, addedLines: 1, removedLines: 0, hunks: parseHunks(section), patchSection: section };

describe('null review limits mean no limit (08-LIM)', () => {
  it('08-LIM3: any number of valid findings is ok when maxFindings is null', () => {
    const finding = (line: number) => ({ risk: 'high' as const, confidence: 'high' as const, category: 'correctness', location: { oldPath: 'src/a.ts', newPath: 'src/a.ts', side: 'new' as const, line }, problem: 'x', impact: 'i', confidenceReason: 'c', suggestedComment: `y${line}`, ruleRefs: [], requirementRefs: [], supportingLocations: [] });
    const result = validateFindings({
      output: { findings: Array.from({ length: 40 }, () => finding(2)), requirementCoverage: [], coverageNotes: [] },
      files: [file], snapshotText: new Map([['src/a.ts', 'export const a = 1;\nexport const b = 2;\n']]),
      maxFindings: null, knownRuleIds: new Set(), knownRequirementIds: new Set(),
    });
    assert.equal(result.kind, 'ok');
  });
});
