import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReviewResult } from '../contracts/review.ts';
import { reviewResult } from '../testing/review-fixture.ts';
import { renderReport } from './report.ts';

function render(checks: ReviewResult['checks']): string {
  return renderReport({
    result: { ...reviewResult(), checks },
    snapshotDirectory: '/tmp/snapshot',
    resultPath: '/work/app/.ambicode/reviews/r-0001/result.json',
    pendingApprovals: [],
  });
}

describe('the verification section says whether a command executed', () => {
  const [executed] = reviewResult().checks;
  assert.ok(executed !== undefined);

  it('labels an executed command "ran"', () => {
    const text = render([executed]);
    assert.match(text, /^ {5}ran: eslint -- src\/orders\.ts$/m);
    assert.doesNotMatch(text, /would have run/);
  });

  it('labels a skipped check that carries an argv "would have run", never "ran"', () => {
    const text = render([
      {
        ...executed,
        status: 'skipped',
        exitCode: null,
        durationMs: null,
        outputRef: null,
        mutations: [],
        limitations: ['Remote executable checks are disabled.'],
      },
    ]);
    assert.match(text, /^ {5}would have run: eslint -- src\/orders\.ts$/m);
    assert.doesNotMatch(text, /^ {5}ran:/m);
  });

  it('prints no command line for a check that had none', () => {
    const text = render([{ ...executed, status: 'skipped', argv: [], exitCode: null }]);
    assert.doesNotMatch(text, /ran:/);
  });
});

describe('the requirements section says when AMBICODE received a source', () => {
  function requirementLines(overrides: Record<string, unknown>): string {
    const base = reviewResult();
    const result = { ...base, requirements: [{ ...base.requirements[0], ...overrides }] } as ReviewResult;
    const lines = renderReport({
      result,
      snapshotDirectory: '/tmp/snapshot',
      resultPath: '/work/app/.ambicode/reviews/r-0001/result.json',
      pendingApprovals: [],
    }).split('\n');
    const start = lines.indexOf('   requirements');
    assert.notEqual(start, -1);
    const block = lines.slice(start + 1);
    const end = block.findIndex((line) => !line.startsWith('     '));
    return block.slice(0, end === -1 ? undefined : end).join('\n');
  }

  it('prints the CLI receipt time, and the session retrieval time only when it supplied one', () => {
    const both = requirementLines({ receivedAt: '2026-09-21T08:15:00.000Z' });
    assert.match(both, /received 2026-09-21T08:15:00\.000Z by AMBICODE via mcp__atlassian__getJiraIssue/);
    assert.match(both, /retrieved 2026-09-20T09:00:00\.000Z by the session/);

    const receiptOnly = requirementLines({ receivedAt: '2026-09-21T08:15:00.000Z', retrievedAt: null });
    assert.match(receiptOnly, /received 2026-09-21T08:15:00\.000Z by AMBICODE via mcp__atlassian__getJiraIssue/);
    assert.doesNotMatch(receiptOnly, /retrieved 20|null/);
  });

  it('prints a result stored before receivedAt existed without inventing a receipt time', () => {
    const legacy = requirementLines({});
    assert.match(legacy, /retrieved 2026-09-20T09:00:00\.000Z via mcp__atlassian__getJiraIssue/);
    assert.doesNotMatch(legacy, /received|null|undefined/);
  });
});
