import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from '../cli/args.ts';
import { runConfig, renderConfig } from '../cli/commands/config.ts';
import { REVIEW_OPTIONS, runReview } from '../cli/commands/review.ts';
import { DEFAULTS } from '../config/defaults.ts';
import { parseHunks, type DiffFile } from '../git/diff.ts';
import { enforceReviewInputLimits } from '../snapshot/limits.ts';
import { TASK } from '../testing/check-fixture.ts';
import { reviewRouteFixture } from '../testing/review-route-fixture.ts';
import { validateFindings } from './validate.ts';

const section = ['@@ -1,1 +1,2 @@', ' export const a = 1;', '+export const b = 2;'].join('\n');
const file: DiffFile = { oldPath: 'src/a.ts', newPath: 'src/a.ts', changeKind: 'modified', binary: false, addedLines: 1, removedLines: 0, hunks: parseHunks(section), patchSection: section };

describe('null review limits mean no limit (08-LIM)', () => {
  it('08-LIM1: the defaults set no finding, file, line or context limit', () => {
    assert.deepEqual([DEFAULTS.review.maxFindings, DEFAULTS.review.maxChangedFiles, DEFAULTS.review.maxChangedLines, DEFAULTS.review.maxContextBytes], [null, null, null, null]);
  });

  it('08-LIM2: a very large change passes the input limits when they are null', () => {
    const measured = { changedFiles: 10_000, changedLines: 5_000_000, patchBytes: 1e9, snapshotBytes: 1e9, requirementBytes: 0, promptBytes: 0, contextBytes: 2e9 };
    assert.doesNotThrow(() => enforceReviewInputLimits(measured, DEFAULTS.review));
  });

  it('08-LIM3: any number of valid findings is ok when maxFindings is null', () => {
    const finding = (line: number) => ({ risk: 'high' as const, confidence: 'high' as const, category: 'correctness', location: { oldPath: 'src/a.ts', newPath: 'src/a.ts', side: 'new' as const, line }, supportingLocations: [], explanation: 'x', suggestedComment: `y${line}`, ruleRefs: [], requirementRefs: [] });
    const result = validateFindings({
      output: { findings: Array.from({ length: 40 }, () => finding(2)), coverageNotes: [] },
      files: [file], snapshotText: new Map([['src/a.ts', 'export const a = 1;\nexport const b = 2;\n']]),
      reviewId: 'r1', maxFindings: null, knownRuleIds: new Set(), knownRequirementIds: new Set(),
    });
    assert.equal(result.kind, 'ok');
  });

  it('08-LIM4: config prints no limit, and the reviewer prompt asks for no finding count', async () => {
    const t = await reviewRouteFixture();
    try {
      const configPath = path.join(t.runtime.cwd, '.ambicode', 'config.yaml');
      await writeFile(configPath, (await readFile(configPath, 'utf8')).replace(/maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288/, 'maxFindings: null, maxChangedFiles: null, maxChangedLines: null, maxContextBytes: null'));
      assert.match(renderConfig(await runConfig(t.runtime)), /maxFindings {9}no limit\n {2}maxChangedFiles {5}no limit\n {2}maxChangedLines {5}no limit\n {2}maxContextBytes {5}no limit/);
      await t.start();
      await t.hook('estimate', 'run');
      let prompt = '';
      const reviewer = { async invoke(request: { prompt: string }) { prompt = request.prompt; return { kind: 'ok', output: { findings: [], coverageNotes: [] }, rawLength: 2, argv: ['claude'] } as never; } };
      await runReview(t.runtime, parseArgs('review', ['--task', TASK], REVIEW_OPTIONS), { reviewer: reviewer as never, warm: async () => {} });
      assert.match(prompt, /Return the findings that most deserve a human's time\./);
      assert.doesNotMatch(prompt, /at most \d+ findings/);
    } finally {
      await t.fx.dispose();
    }
  });
});
