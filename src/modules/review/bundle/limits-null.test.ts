import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '#testing/fixtures/route-fixture';
import { parseConfig } from '#modules/config/load';

// Limits left null in config: nothing refuses or voids.
const NO_LIMITS = parseConfig(CONFIG.replace('maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288', 'maxFindings: null, maxChangedFiles: null, maxChangedLines: null, maxContextBytes: null')).skills.review;
import { parseHunks } from '#platform/git/diff';
import { enforceReviewInputLimits } from '../snapshot/change.ts';
import { reviewRouteFixture } from '#testing/fixtures/review-route-fixture';
import { validateFindings } from '../findings/validate.ts';
import type { DiffFile } from '#types/platform/git';

const section = ['@@ -1,1 +1,2 @@', ' export const a = 1;', '+export const b = 2;'].join('\n');
const file: DiffFile = { oldPath: 'src/a.ts', newPath: 'src/a.ts', changeKind: 'modified', binary: false, addedLines: 1, removedLines: 0, hunks: parseHunks(section), patchSection: section };

describe('null review limits mean no limit (08-LIM)', () => {
  it('08-LIM1: the defaults set no finding, file, line or context limit', () => {
    assert.deepEqual([NO_LIMITS.maxFindings, NO_LIMITS.maxChangedFiles, NO_LIMITS.maxChangedLines, NO_LIMITS.maxContextBytes], [null, null, null, null]);
  });

  it('08-LIM2: a very large change passes the input limits when they are null', () => {
    const measured = { changedFiles: 10_000, changedLines: 5_000_000, patchBytes: 1e9, requirementBytes: 0, contextBytes: 2e9 };
    assert.doesNotThrow(() => enforceReviewInputLimits(measured, NO_LIMITS));
  });

  it('08-LIM3: any number of valid findings is ok when maxFindings is null', () => {
    const finding = (line: number) => ({ risk: 'high' as const, confidence: 'high' as const, category: 'correctness', location: { oldPath: 'src/a.ts', newPath: 'src/a.ts', side: 'new' as const, line }, explanation: 'x', suggestedComment: `y${line}`, ruleRefs: [], requirementRefs: [] });
    const result = validateFindings({
      output: { findings: Array.from({ length: 40 }, () => finding(2)), coverageNotes: [] },
      files: [file], snapshotText: new Map([['src/a.ts', 'export const a = 1;\nexport const b = 2;\n']]),
      maxFindings: null, knownRuleIds: new Set(), knownRequirementIds: new Set(),
    });
    assert.equal(result.kind, 'ok');
  });
});
