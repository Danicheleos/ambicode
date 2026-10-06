import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { RouteView } from '../route/context.ts';
import type { LedgerEntry } from '../task/ledger.ts';
import { finding, reviewResult } from '../testing/review-fixture.ts';
import { evaluateReview, type ReviewEntry } from './review-evaluation.ts';

const VIEW: RouteView = { task: 't', routeId: 'route-1', chainIds: ['route-1'], skill: 'task', session: 's', mode: 'interactive', channel: 'hook', trusted: false, position: 'review-run' };
const at = (path: string, id: string) => finding({ id, location: { oldPath: path, newPath: path, side: 'new', line: 1 } });
const entry = (id: string, kind: string, fields: Record<string, unknown> = {}): LedgerEntry => ({ id, at: '2026-01-01T00:00:00Z', kind, route: 'route-1', ...fields });
const reviewEntry = (fields: Record<string, unknown> = {}) => entry('rv', 'review', { waiting: [], reviewerRan: true, ...fields }) as ReviewEntry;
const result = (...paths: string[]) => reviewResult({ kind: 'working', findings: paths.map((p, i) => at(p, `f-${i}`)) });
const TOUCHED = ['src/a.ts'];

describe('evaluateReview (07-V)', () => {
  it('07-V1: waiting keys without an answer win over scope and fix findings', () => {
    const review = reviewEntry({ waiting: ['app/e2e', 'app/x'] });
    const out = evaluateReview(VIEW, review, result('src/a.ts', 'src/other.ts'), TOUCHED, [review]);
    assert.deepEqual(out, { next: 'waiting', keys: ['app/e2e', 'app/x'], raisedBy: 'review-run' });
  });

  it('07-V1: an answer matches by its key field or via the print values.key, leaving the rest waiting', () => {
    const review = reviewEntry({ waiting: ['app/e2e', 'app/x', 'app/y'] });
    const print = entry('g1', 'gate', { gate: 'check-only-unauthorized', values: { key: ['app/x'] } });
    const chain = [review, print, entry('a1', 'acceptance', { gate: 'check-only-unauthorized', key: 'app/e2e' }), entry('a2', 'acceptance', { gate: 'check-only-unauthorized', instance: 'g1' })];
    const out = evaluateReview(VIEW, review, result(), TOUCHED, chain);
    assert.deepEqual(out, { next: 'waiting', keys: ['app/y'], raisedBy: 'review-run' });
  });

  it('07-V1: an unbound answer and an acting-needs-human decline do not count', () => {
    const review = reviewEntry({ waiting: ['app/e2e'] });
    const chain = [
      review,
      entry('a1', 'acceptance', { gate: 'check-only-unauthorized', key: 'app/e2e', unbound: true }),
      entry('a2', 'declined', { gate: 'check-only-unauthorized', key: 'app/e2e', reason: 'acting-needs-human' }),
    ];
    assert.equal(evaluateReview(VIEW, review, result(), TOUCHED, chain).next, 'waiting');
  });

  it('07-V1: an answer recorded before the review, or in another route, does not count', () => {
    const review = reviewEntry({ waiting: ['app/e2e'] });
    const chain = [entry('a0', 'acceptance', { gate: 'check-only-unauthorized', key: 'app/e2e' }), review, entry('a1', 'acceptance', { gate: 'check-only-unauthorized', key: 'app/e2e', route: 'other' })];
    assert.equal(evaluateReview(VIEW, review, result(), TOUCHED, chain).next, 'waiting');
  });

  it('07-V1: an answered key (declined included) stops waiting', () => {
    const review = reviewEntry({ waiting: ['app/e2e'] });
    const chain = [review, entry('a1', 'declined', { gate: 'check-only-unauthorized', key: 'app/e2e', reason: 'user' })];
    assert.equal(evaluateReview(VIEW, review, result(), TOUCHED, chain).next, 'proceed');
  });

  it('07-V1: out-of-scope findings with no scope answer give scope, at most 3 lines plus more', () => {
    const review = reviewEntry();
    const out = evaluateReview(VIEW, review, result('src/o1.ts', 'src/o2.ts', 'src/o3.ts', 'src/o4.ts', 'src/o5.ts', 'src/a.ts'), TOUCHED, [review]);
    assert.equal(out.next, 'scope');
    if (out.next !== 'scope') return;
    assert.equal(out.findings.length, 3);
    assert.equal(out.more, 2);
    assert.match(out.findings[0]!, /^f-0 src\/o1\.ts:1 — /);
  });

  it('07-V1: scope lists nothing extra when exactly 3 are out of scope', () => {
    const review = reviewEntry();
    const out = evaluateReview(VIEW, review, result('src/o1.ts', 'src/o2.ts', 'src/o3.ts'), TOUCHED, [review]);
    assert.deepEqual([out.next, (out as { more: number }).more], ['scope', 0]);
  });

  it('07-V1: a finding with no newPath is placed by its oldPath', () => {
    const review = reviewEntry();
    const only = reviewResult({ kind: 'working', findings: [finding({ id: 'f-old', location: { oldPath: 'src/a.ts', newPath: null, side: 'old', line: 1 } })] });
    assert.equal(evaluateReview(VIEW, review, only, TOUCHED, [review]).next, 'revise-fix');
  });

  it('07-V1: scope-expanding include gives revise-fix with in-scope and out-of-scope findings', () => {
    const review = reviewEntry();
    const chain = [review, entry('a1', 'acceptance', { gate: 'scope-expanding', answer: 'include' })];
    const out = evaluateReview(VIEW, review, result('src/a.ts', 'src/o1.ts'), TOUCHED, chain);
    assert.equal(out.next, 'revise-fix');
    assert.equal((out as { findings: string[] }).findings.length, 2);
  });

  it('07-V1: scope-expanding out of scope keeps only in-scope findings', () => {
    const review = reviewEntry();
    const chain = [review, entry('a1', 'acceptance', { gate: 'scope-expanding', answer: 'out of scope' })];
    const out = evaluateReview(VIEW, review, result('src/a.ts', 'src/o1.ts'), TOUCHED, chain);
    assert.equal(out.next, 'revise-fix');
    assert.deepEqual((out as { findings: string[] }).findings.length, 1);
    assert.match((out as { findings: string[] }).findings[0]!, /src\/a\.ts/);
  });

  it('07-V1: scope-expanding out of scope with only out-of-scope findings proceeds', () => {
    const review = reviewEntry();
    const chain = [review, entry('a1', 'default-taken', { gate: 'scope-expanding', answer: 'out of scope' })];
    assert.deepEqual(evaluateReview(VIEW, review, result('src/o1.ts'), TOUCHED, chain), { next: 'proceed' });
  });

  it('07-V1: in-scope findings give revise-fix; no findings proceed', () => {
    const review = reviewEntry();
    assert.equal(evaluateReview(VIEW, review, result('src/a.ts'), TOUCHED, [review]).next, 'revise-fix');
    assert.deepEqual(evaluateReview(VIEW, review, result(), TOUCHED, [review]), { next: 'proceed' });
  });

  it('07-V1: raisedBy is review-run for a first review and fix after a delivered fix step', () => {
    const first = reviewEntry({ waiting: ['k'] });
    const stepFix = entry('s1', 'step', { step: 'fix', status: 'delivered' });
    const second = reviewEntry({ waiting: ['k'] });
    const raised = (review: ReviewEntry, chain: LedgerEntry[]) => (evaluateReview(VIEW, review, null, TOUCHED, chain) as { raisedBy: string }).raisedBy;
    assert.equal(raised(first, [entry('s0', 'step', { step: 'red', status: 'delivered' }), first]), 'review-run');
    assert.equal(raised(second, [first, stepFix, second]), 'fix');
  });

  it('07-V1: a fix step that is not delivered does not make raisedBy fix', () => {
    const review = reviewEntry({ waiting: ['k'] });
    const chain = [entry('s1', 'step', { step: 'fix', status: 'completed' }), review];
    assert.equal((evaluateReview(VIEW, review, null, TOUCHED, chain) as { raisedBy: string }).raisedBy, 'review-run');
  });

  it('07-V2: the same inputs give a deep-equal result twice', () => {
    const review = reviewEntry();
    const res = result('src/o1.ts', 'src/a.ts');
    const chain = [review];
    assert.deepEqual(evaluateReview(VIEW, review, res, TOUCHED, chain), evaluateReview(VIEW, review, res, TOUCHED, chain));
  });

  it('07-V2: reviewerRan false gives proceed whatever the findings', () => {
    const review = reviewEntry({ reviewerRan: false });
    assert.deepEqual(evaluateReview(VIEW, review, result('src/a.ts', 'src/o.ts'), TOUCHED, [review]), { next: 'proceed' });
  });
});
