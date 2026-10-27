import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkFacts, factsOf, gapsOf, reviewFact } from './report.ts';
import type { LedgerEntry } from '#types/modules/evidence';

let counter = 0;
const entry = (kind: string, fields: object = {}): LedgerEntry => ({ id: `a1b2c3d4-${(counter += 1)}`, at: '2026-10-05T10:00:00.000Z', kind, ...fields });
const check = (fields: object): LedgerEntry => entry('check', { key: 'web/unit', files: [], exit: 0, phase: 'green', ms: 10, ...fields });
const route = (fields: object = {}): LedgerEntry => entry('route', { skill: 'task', args: 'x', mode: 'interactive', channel: 'hook', trusted: true, session: 'a1b2c3d4', epoch: 1, ...fields });
const review = (reviewId: string, findings: number, fields: object = {}): LedgerEntry => entry('review', { reviewId, stage: 'recorded', status: 'complete', reviewerRan: true, findings, omissions: 0, ...fields });
const offer = (kind: string, answer: string, fields: object = {}): LedgerEntry => entry(kind, { route: 'r', gate: 'review-offer', instance: null, answer, via: 'headless', ...fields });

describe('gapsOf: checks never claim more than the ledger says', () => {
  it('a plan accepted with bad anchors is not verified; one accepted with none is not listed', () => {
    const plan = (anchorsBad: number) => entry('note', { note: 'plan', path: 'p.md', contentHash: 'h', anchorsBad });
    assert.deepEqual(gapsOf([plan(2)]), ['plan accepted with 2 bad anchors']);
    assert.deepEqual(gapsOf([plan(0)]), []);
  });

  it('a plan accepted with uncited policy rules says how many', () => {
    const plan = (fields: object) => entry('note', { note: 'plan', path: 'p.md', contentHash: 'h', anchorsBad: 0, ...fields });
    assert.deepEqual(gapsOf([plan({ policyMissing: 3 })]), ['plan accepted without 3 policy citations']);
    assert.deepEqual(gapsOf([plan({})]), []);
  });


  it('a nonzero last exit and a declined key are not verified', () => {
    const gaps = gapsOf([
      check({ key: 'web/e2e', phase: 'red', exit: 2 }),
      entry('declined', { route: 'r', gate: 'check:web/slow', instance: null, answer: 'no', via: 'flag', reason: 'acting-needs-human' }),
    ]);
    assert.deepEqual(gaps, ['web/e2e: last run exited 2', 'check:web/slow: declined "no" (acting-needs-human)']);
  });

  it('a recorded step failure and drafts that failed their check are not verified; a failed step with no record is not', () => {
    const gaps = gapsOf([
      entry('step', { route: 'r', step: 'plan-check', actor: 'code', status: 'failed', cause: 'route-next', recorded: true, code: 'plan-check-failed', message: '1 bad anchors: a.ts:9 missing-file' }),
      entry('step', { route: 'r', step: 'scan', actor: 'code', status: 'failed', cause: 'route-next', code: 'script-failed', message: 'crashed' }),
      entry('policy', { route: 'r', stage: 'drafts', path: 'd', contentHash: 'h', drafts: [], errors: 2 }),
    ]);
    assert.deepEqual(gaps, ['plan-check: 1 bad anchors: a.ts:9 missing-file', 'rules drafts: 2 check errors']);
  });

  it('a delivery, a completion or an exit code alone is no gap and no test result', () => {
    const entries = [entry('step', { route: 'r', step: 'fix', actor: 'model', status: 'completed', cause: 'route-next' }), entry('exit', { route: 'r', reason: 'done' })];
    assert.deepEqual(gapsOf(entries), []);
    assert.deepEqual(checkFacts(entries), []);
    assert.doesNotMatch(factsOf(entries), /passed/);
  });

  it('only the last run of a key decides whether it is verified', () => {
    assert.deepEqual(gapsOf([check({ phase: 'red', exit: 1 }), check({})]), []);
    assert.deepEqual(gapsOf([check({}), check({ exit: 1 })]), ['web/unit: last run exited 1']);
  });
});

describe('gapsOf: what was skipped, declined or limited is visible', () => {
  it('lists declines, defaults with their via, limits, missing sources, a reviewer that did not run and a model-set headless', () => {
    const gaps = gapsOf([
      route({ mode: 'headless', channel: 'cli', trusted: false }),
      entry('declined', { route: 'r', gate: 'review-offer', instance: null, answer: 'run', via: 'flag', reason: 'acting-needs-human' }),
      entry('default-taken', { route: 'r', gate: 'scope', instance: null, answer: 'out of scope', via: 'never-asked' }),
      entry('default-taken', { route: 'r', gate: 'plan-accept', instance: null, answer: 'Reject', via: 'headless' }),
      entry('limit', { route: 'r', which: 'repeat', count: 2, step: 'ground' }),
      entry('envelope', { sources: [], builtFrom: 'args', asked: ['A-1', 'A-2'], missingAsked: ['A-2'], hash: 'h' }),
      entry('review', { reviewId: 'local_2', status: 'partial', reviewerRan: false, findings: 0, omissions: 3 }),
    ]).join('\n');
    for (const expected of [
      /review-offer: declined "run" \(acting-needs-human\)/,
      /scope: default taken, "out of scope" \(never-asked\)/,
      /plan-accept: default taken, "Reject" \(headless\)/,
      /A step was repeated 2 times and stopped there/,
      /Requirement not captured: A-2/,
      /The independent review did not run/,
      /headless set by an untrusted start/,
    ]) assert.match(gaps, expected);
  });

  it('a trusted headless start and a complete review are not listed', () => {
    assert.deepEqual(gapsOf([route({ mode: 'headless', channel: 'hook', trusted: true }), entry('review', { reviewId: 'r', status: 'complete', reviewerRan: true })]), []);
  });

  it('a bound acceptance or a default-taken review-offer starting with skip is listed; run is not', () => {
    const skipped = 'independent review skipped — verification incomplete';
    assert.deepEqual(gapsOf([offer('acceptance', 'skip — verification incomplete', { instance: 'i', via: 'hook' })]), [skipped]);
    assert.deepEqual(gapsOf([offer('default-taken', 'skip — verification incomplete')]), ['review-offer: default taken, "skip — verification incomplete" (headless)', skipped]);
    assert.deepEqual(gapsOf([offer('acceptance', 'run', { instance: 'i', via: 'hook' })]), []);
  });

  it('an unbound skip answer is not counted as a bound one', () => {
    assert.deepEqual(gapsOf([offer('acceptance', 'skip — verification incomplete', { instance: 'i', unbound: true })]), []);
  });

  it('a skipped re-review is a gap', () => {
    assert.deepEqual(gapsOf([entry('acceptance', { route: 'r', gate: 'review-again', instance: 'i', answer: 'skip', via: 'hook' })]), ['fix not re-reviewed']);
  });

  it('a format that failed lists the key and outcome; formatted does not; an unconfigured formatter is no gap but is stated once as a fact', () => {
    const format = (outcome: string): LedgerEntry => entry('format', { key: 'app/format', files: [], exit: null, outcome });
    for (const outcome of ['failed', 'refused']) assert.deepEqual(gapsOf([format(outcome)]), [`not formatted: app/format (${outcome})`]);
    assert.deepEqual(gapsOf([format('formatted'), format('unconfigured')]), []);
    assert.deepEqual(checkFacts([format('unconfigured'), format('unconfigured')]), ['no formatter configured']);
    assert.deepEqual(checkFacts([format('formatted')]), []);
  });

  it('missing-produces at any step reads as a generic limit; the Stop hook own block is not a gap', () => {
    assert.deepEqual(gapsOf([entry('limit', { which: 'missing-produces', step: 'change', count: 3 })]), ['The required result was not produced during the change after 3 tries']);
    assert.deepEqual(gapsOf([entry('limit', { route: 'r', which: 'stop-block', count: 1 })]), []);
  });

  it('identical gaps are listed once', () => {
    const limit = (): LedgerEntry => entry('limit', { route: 'r', which: 'green-unproven', count: 1, step: 'change' });
    assert.deepEqual(gapsOf([route(), limit(), limit()]), ['A passing check was not proven during the change']);
  });

  it('entries that are not current are left out', () => {
    const old = check({ phase: 'red', exit: 1 });
    const stale = entry('declined', { route: 'r', gate: 'g', instance: null, answer: 'no', via: 'flag' });
    const entries = [old, stale, check({ key: 'web/other', exit: 3 })];
    assert.deepEqual(gapsOf(entries, (candidate) => candidate.id !== old.id && candidate.id !== stale.id), ['web/other: last run exited 3']);
    assert.equal(gapsOf(entries).length, 3);
  });

  it('a green-unproven limit is dropped once a later green check passed in the same step, kept when none did or the pass came in another step', () => {
    const limit = (): LedgerEntry => entry('limit', { route: 'r', which: 'green-unproven', count: 1, step: 'change', cause: 'nonzero-exit', key: 'web/unit', files: ['service', 'test'] });
    assert.deepEqual(gapsOf([route(), check({ exit: 1 }), limit(), check({ exit: 0, files: ['service', 'repository', 'test'] })]), []);
    assert.match(gapsOf([route(), check({ exit: 1 }), limit()]).join(), /web\/unit failed during the change and no later run passed/);
    assert.match(gapsOf([route(), check({ exit: 1 }), limit(), entry('step', { step: 'fix', status: 'delivered' }), check({ exit: 0 })]).join(), /web\/unit failed during the change and no later run passed/);
  });

  it('a green-unproven limit survives a pass on a disjoint file or another check key', () => {
    const limit = entry('limit', { route: 'r', which: 'green-unproven', count: 1, step: 'change', cause: 'nonzero-exit', key: 'web/unit', files: ['service', 'test'] });
    const failed = check({ exit: 1, files: ['service', 'test'] });
    assert.match(gapsOf([route(), failed, limit, check({ exit: 0, files: ['other'] })]).join(), /web\/unit failed during the change and no later run passed/);
    assert.match(gapsOf([route(), failed, limit, check({ exit: 0, key: 'web/lint', files: ['service', 'test'] })]).join(), /web\/unit failed during the change and no later run passed/);
    assert.match(gapsOf([route(), failed, limit, check({ exit: 0, files: ['service'] })]).join(), /web\/unit failed during the change and no later run passed/);
  });

  it('a recorded review replaces the pending entry of the same id, so the gaps no longer say the reviewer did not run', () => {
    assert.deepEqual(gapsOf([
      entry('review', { reviewId: 'local_1', status: 'partial', reviewerRan: false, omissions: 1 }),
      entry('review', { reviewId: 'local_1', status: 'complete', reviewerRan: true, findings: 1, omissions: 0 }),
      entry('review', { reviewId: 'local_2', status: 'partial', reviewerRan: false, omissions: 1 }),
    ]), ['The independent review did not run']);
  });
});

describe('the facts the final message copies', () => {
  it('names each check by outcome, never by phase', () => {
    assert.deepEqual(checkFacts([check({ phase: 'red', exit: 1 }), check({ key: 'web/lint', exit: 1 }), check({})]), ['web/unit: passed', 'web/lint: failed exit 1']);
  });

  it('counts findings, what the fix rounds took, and how the re-review ended', () => {
    assert.equal(reviewFact([review('a', 0)]), 'no findings');
    assert.equal(reviewFact([review('a', 1), review('b', 0)]), '1 finding, re-review clean');
    assert.equal(reviewFact([review('a', 3), review('b', 2)]), '3 findings, re-review 2 open');
    assert.equal(reviewFact([review('a', 3)]), '3 findings, re-review not run');
    assert.equal(reviewFact([review('a', 1), entry('default-taken', { route: 'r', gate: 'review-again', instance: 'i', answer: 'skip', via: 'headless' })]), '1 finding, re-review skipped by default (headless)');
    assert.equal(reviewFact([offer('default-taken', 'skip — verification incomplete')]), 'skipped by default (headless)');
    assert.equal(reviewFact([review('a', 1), entry('acceptance', { route: 'r', gate: 'review-again', instance: 'i', answer: 'skip', via: 'hook' })]), '1 finding, re-review skipped by you');
    assert.equal(reviewFact([offer('acceptance', 'skip — verification incomplete', { instance: 'i', via: 'hook' })]), 'skipped by you');
    assert.equal(reviewFact([]), null);
  });

  it('prints Checks, Review and Not verified, leaves out a section with nothing to say, and says when no check is configured', () => {
    assert.equal(factsOf([check({}), review('a', 0)]), 'Checks\n- web/unit: passed\nReview\n- no findings');
    assert.equal(factsOf([{ id: 'b', at: 't', kind: 'baseline', runnable: 0 } as LedgerEntry]), 'Not verified\n- nothing was verified by running checks (none configured)');
    assert.equal(factsOf([{ id: 'b', at: 't', kind: 'baseline', runnable: 2 } as LedgerEntry]), 'Checks\n- no check ran');
    assert.equal(factsOf([], undefined, { checks: false }), '');
    assert.equal(factsOf([check({ exit: 1 })]), 'Checks\n- web/unit: failed exit 1\nNot verified\n- web/unit: last run exited 1');
  });
  it('a re-review that errored or came back partial never reads as clean', () => {
    assert.equal(reviewFact([review('a', 1), review('b', 0, { status: 'error', omissions: 2 })]), '1 finding, re-review failed');
    assert.equal(reviewFact([review('a', 1), review('b', 0, { status: 'partial', omissions: 2 })]), '1 finding, re-review partial: no findings, 2 omissions');
    assert.equal(reviewFact([review('a', 1), review('b', 2, { status: 'partial', omissions: 1 })]), '1 finding, re-review partial: 2 open, 1 omission');
    assert.equal(reviewFact([review('a', 0, { status: 'error' })]), 'review failed');
    assert.equal(reviewFact([review('a', 0, { status: 'partial', omissions: 3 })]), 'no findings, review partial: 3 omissions');
    assert.equal(reviewFact([review('a', 0, { status: 'error' }), entry('acceptance', { route: 'r', gate: 'review-again', instance: 'i', answer: 'skip', via: 'hook' })]), 'review failed, re-review skipped by you');
  });

  it('an errored re-review is also listed under Not verified, in plain words and with no review id', () => {
    const facts = factsOf([check({}), review('review-2026-aaa', 1), review('review-2026-bbb', 0, { status: 'error', statusReason: 'invalid-output: x' })]);
    assert.match(facts, /Review\n- 1 finding, re-review failed/);
    const gaps = gapsOf([review('review-2026-bbb', 0, { status: 'error', omissions: 2 }), review('review-2026-ccc', 0, { status: 'partial', omissions: 3 })]);
    assert.deepEqual(gaps, ['The independent review failed: the reviewer\'s answer could not be verified, so its result is not counted', 'The independent review was partial: 3 omissions']);
  });

  it('limits read as what happened, not as an internal step name', () => {
    const limit = (fields: object): LedgerEntry => entry('limit', { route: 'r', count: 1, ...fields });
    const gaps = gapsOf([
      limit({ which: 'check', count: 5, step: 'format' }),
      limit({ which: 'green-unproven', step: 'change', key: 'web/unit', cause: 'nonzero-exit', files: ['a'] }),
      limit({ which: 'green-unproven', step: 'fix', key: 'web/lint', cause: 'not-run', files: ['a'] }),
      limit({ which: 'repeat', count: 2, step: 'ground' }),
    ]);
    assert.deepEqual(gaps, [
      'Checks kept failing during formatting: stopped after 5 attempts',
      'web/unit failed during the change and no later run passed on the same files',
      'web/lint could not run during the fix',
      'A step was repeated 2 times and stopped there',
    ]);
    for (const line of gaps) assert.doesNotMatch(line, /\blimit\b|\bat (format|change|fix|ground)\b/);
  });
});
