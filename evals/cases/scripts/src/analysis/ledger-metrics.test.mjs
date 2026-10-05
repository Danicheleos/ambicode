// The v6 route measures, read from synthetic ledgers only: no case, ticket or benchmark data is involved.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ledgerMetrics, ledgersOf, LEDGER_DIRECTORY } from './ledger-metrics.mjs';

describe('ledger-metrics: red/green proof', () => {
  const route = (id, extra = {}) => ({ id, kind: 'route', skill: 'task', ...extra });
  const check = (phase, failed, extra = {}) => ({ kind: 'check', route: 'r-1', key: 'web/unit', only: ['a.spec.ts'], phase, exit: failed ? 1 : 0, summary: { ran: 2, failed }, ...extra });
  const redGreen = (...ledgers) => ledgerMetrics(ledgers.map((entries) => ({ entries, unreadable: 0 })))?.checkRedGreen ?? null;
  const proven = (...ledgers) => redGreen(...ledgers)?.proven ?? null;

  it('proves a recorded red then green of the same key and test scope in one chain', () => {
    assert.equal(proven([route('r-1'), check('red', 1), check('green', 0)]), true);
    assert.equal(proven([route('r-1'), check('red', 1, { only: ['b.spec.ts', 'a.spec.ts'] }), check('green', 0, { only: ['a.spec.ts', 'b.spec.ts'] })]), true, 'scope order does not matter');
    assert.equal(proven([route('r-1'), check('red', 1, { only: undefined }), check('green', 0, { only: undefined })]), true, 'the whole suite is a scope too');
  });

  it('does not prove a failed green then a passing green', () => {
    assert.equal(proven([route('r-1'), check('green', 1), check('green', 0)]), false);
  });

  it('does not join a red and a green from different tasks, keys or scopes', () => {
    assert.equal(proven([route('a-1'), check('red', 1, { route: 'a-1', only: ['a.spec.ts'] })], [route('b-1'), check('green', 0, { route: 'b-1', only: ['b.spec.ts'] })]), false, 'two ledgers');
    assert.equal(proven([route('r-1'), check('red', 1)], [route('r-1'), check('green', 0)]), false, 'same route id and scope, but another ledger file');
    assert.equal(proven([route('r-1'), check('red', 1), check('green', 0, { key: 'web/e2e' })]), false, 'another check key');
    assert.equal(proven([route('r-1'), check('red', 1), check('green', 0, { only: ['b.spec.ts'] })]), false, 'another test scope');
    assert.equal(proven([route('r-1'), check('red', 1), route('r-2'), check('green', 0, { route: 'r-2' })]), false, 'another route chain');
  });

  it('keeps interleaved unrelated routes apart, whatever comes last', () => {
    const a = (phase, failed) => check(phase, failed, { route: 'a-1' });
    const b = (phase, failed) => check(phase, failed, { route: 'b-1' });
    assert.equal(proven([route('a-1'), route('b-1'), a('red', 1), b('green', 0)]), false, 'a red on A and a matching green on B');
    assert.equal(proven([route('a-1'), a('red', 1), route('b-1'), b('green', 0)]), false, 'B started after A\'s red');
    assert.equal(proven([route('a-1'), route('b-1'), a('red', 1), b('red', 1), b('green', 0)]), true, 'B\'s own red then green');
    assert.equal(proven([route('a-1'), route('b-1'), b('red', 1), a('red', 1), a('green', 0)]), true, 'A\'s chain, though B came last');
  });

  it('follows valid resumes transitively, and only those', () => {
    assert.equal(proven([route('r-1'), check('red', 1), route('r-2', { resumes: 'r-1' }), route('r-3', { resumes: 'r-2' }), check('green', 0, { route: 'r-3' })]), true, 'r-3 resumes r-1 through r-2');
    assert.equal(proven([route('r-1'), check('red', 1), route('r-2', { resumes: 'r-9' }), check('green', 0, { route: 'r-2' })]), false, 'a resume of a route the ledger never had');
    assert.equal(proven([route('r-1'), check('red', 1), route('r-2', { resumes: 'r-3' }), route('r-3', { resumes: 'r-1' }), check('green', 0, { route: 'r-2' })]), false, 'a resume of a later route');
    assert.equal(proven([route('r-1'), check('red', 1), route('r-2', { resumes: 42 }), check('green', 0, { route: 'r-2' })]), false, 'a malformed resume');
    assert.equal(proven([route('r-1'), check('red', 1), route('r-1'), check('green', 0)]), false, 'a repeated route id is ambiguous');
    assert.equal(proven([route('r-1'), check('red', 1), route('r-2', { resumes: 'r-1' }), route('r-1'), check('green', 0, { route: 'r-2' })]), false, 'resuming a route whose id repeats');
  });

  it('respects order, supersession and revision within the relevant chain', () => {
    assert.equal(proven([route('r-1'), check('green', 0), check('red', 1)]), false, 'reversed');
    assert.equal(proven([route('r-1'), check('red', 1), { kind: 'revise', route: 'r-1', from: 'implement', via: 'code' }, check('green', 0)]), false, 'revised in between');
    assert.equal(proven([route('r-1'), check('red', 1), { kind: 'exit', route: 'r-1', reason: 'superseded' }, check('green', 0)]), false, 'superseded in between');
    assert.equal(proven([route('r-1'), check('red', 1), route('r-2', { resumes: 'r-1' }), { kind: 'revise', route: 'r-2', from: 'implement', via: 'code' }, check('green', 0, { route: 'r-2' })]), false, 'a revision on a resumed route of the chain');
    assert.equal(proven([route('r-1'), route('r-2'), check('red', 1), { kind: 'revise', route: 'r-2', from: 'implement', via: 'code' }, check('green', 0)]), true, 'an unrelated route\'s revision');
    assert.equal(proven([route('r-1'), route('r-2'), check('red', 1), { kind: 'exit', route: 'r-2', reason: 'done' }, check('green', 0)]), true, 'an unrelated route\'s exit');
    assert.equal(proven([route('r-1'), route('r-2'), check('red', 1), { kind: 'exit', reason: 'superseded' }, check('green', 0)]), false, 'an exit that names no route voids every chain');
    assert.equal(proven([route('r-1'), check('red', 1), { kind: 'revise', route: 'r-9', from: 'implement', via: 'code' }, check('green', 0)]), false, 'a revision naming an unknown route voids every chain');
  });

  it('takes no proof from a missing or malformed association, and counts it', () => {
    assert.deepEqual(redGreen([route('r-1'), check('red', 1, { route: undefined }), check('green', 0, { route: undefined })]), { checks: 2, red: 1, green: 1, malformed: 0, unassociated: 2, proven: false }, 'a legacy ledger stays readable');
    assert.equal(proven([route('r-1'), check('red', 1, { route: 'r-2' }), check('green', 0, { route: 'r-2' })]), false, 'an unknown route');
    assert.equal(proven([check('red', 1), route('r-1'), check('green', 0)]), false, 'a check before its route');
    assert.equal(proven([route('r-1'), check('red', 1, { route: ['r-1'] }), check('green', 0, { route: { id: 'r-1' } })]), false, 'a route that is not an id');
    assert.equal(proven([route('web/unit'), check('red', 1, { route: 'web/unit' }), check('green', 0, { route: 'a.spec.ts' })]), false, 'a check key or file name is not a route');
    assert.equal(proven([route('r-1'), null, 'x', check('red', 1), check('green', 0)]), true, 'non-object lines are skipped');
  });

  it('takes no proof from a malformed or impossible summary', () => {
    for (const summary of [null, {}, { ran: 0, failed: 0 }, { ran: 1, failed: 2 }, { ran: 1.5, failed: 1 }, { ran: '2', failed: '1' }, { ran: 2, failed: -1 }]) {
      assert.equal(proven([route('r-1'), check('red', 1, { summary }), check('green', 0)]), false, JSON.stringify(summary));
      assert.equal(proven([route('r-1'), check('red', 1), check('green', 0, { summary })]), false, JSON.stringify(summary));
    }
    assert.equal(ledgerMetrics([{ entries: [route('r-1'), check('red', 1, { summary: null })], unreadable: 0 }]).checkRedGreen.malformed, 1);
    assert.equal(proven([route('r-1'), check('red', 1, { key: undefined }), check('green', 0, { key: undefined })]), false, 'no key');
  });
});

describe('ledger-metrics: route exits', () => {
  const route = { id: 'r-1', kind: 'route', skill: 'task' };
  const m = (...entries) => ledgerMetrics([{ entries: [route, ...entries], unreadable: 0 }]);

  it('counts a blocked exit as `route stop --reason blocked` writes it', () => {
    assert.equal(m({ kind: 'exit', reason: 'blocked', detail: 'no test runner' }).stopBlocked, 1);
    assert.equal(m({ kind: 'exit', reason: 'stop:blocked' }).stopBlocked, 1, 'the onError action form');
    assert.equal(m({ kind: 'exit', reason: 'done' }, { kind: 'exit', reason: 'inconclusive', detail: 'blocked by nothing' }).stopBlocked, 0);
  });

  it('counts a permission-denied exit once, not the refusal before it', () => {
    const refusal = { kind: 'refusal', code: 'permission-denied', reason: 'permission-denied' };
    const exit = { kind: 'exit', reason: 'blocked', code: 'permission-denied' };
    assert.equal(m(refusal, exit).permissionDenied, 1);
    assert.equal(m(refusal, { kind: 'step', step: 'x', status: 'completed', reason: 'permission-denied' }).permissionDenied, null, 'no exit recorded: unknown, not zero');
    assert.equal(m({ kind: 'exit', reason: 'blocked', detail: 'a permission-denied note' }).permissionDenied, 0, 'free text that mentions it is not the code');
  });
});

describe('ledger-metrics: unknown is not zero', () => {
  const route = { id: 'r-1', kind: 'route', skill: 'task' };
  const one = (...entries) => ledgerMetrics([{ entries, unreadable: 0 }]);
  const step = { kind: 'step', step: 'a', status: 'completed', route: 'r-1' };
  const revise = { kind: 'revise', route: 'r-1', from: 'design', via: 'code' };
  const preanswer = { kind: 'preanswer', gate: 'g', option: 'Accept', via: 'prompt' };
  const print = { id: 'r-1-g', kind: 'gate', gate: 'plan-accept', class: 'declared' };
  const answer = { kind: 'acceptance', gate: 'plan-accept', instance: 'r-1-g', answer: 'Accept', via: 'prompt' };
  const MEASURES = ['routeSteps', 'revises', 'gates', 'preanswers', 'stopBlocked', 'permissionDenied', 'checkRedGreen', 'mapLayers', 'mapPass2', 'envelopeBuiltFrom'];

  it('measures nothing from a route entry alone', () => {
    const m = one(route);
    assert.deepEqual([m.complete, m.routes], [true, 1]);
    for (const key of MEASURES) assert.equal(m[key], null, key);
  });

  it('knows each measure only from its own kind, independently of the others', () => {
    const exits = ['stopBlocked', 'permissionDenied']; // both are read from `exit` records
    const only = (entry, key) => {
      const m = one(route, entry);
      for (const other of MEASURES) if (other !== key && !(exits.includes(key) && exits.includes(other))) assert.equal(m[other], null, `${key} alone leaves ${other} unknown`);
      return m[key];
    };
    assert.deepEqual(only(step, 'routeSteps'), { delivered: 0, completed: 1, skipped: 0 });
    assert.deepEqual(only(revise, 'revises'), { gate: 0, code: 1, model: 0 });
    assert.equal(only(preanswer, 'preanswers'), 1);
    assert.equal(only({ kind: 'exit', reason: 'blocked' }, 'stopBlocked'), 1);
    assert.equal(only({ kind: 'exit', reason: 'blocked', code: 'permission-denied' }, 'permissionDenied'), 1);
  });

  it('reads a recorded exit that is neither blocked nor permission-denied as zero counts', () => {
    const m = one(route, { kind: 'exit', route: 'r-1', reason: 'done' });
    assert.deepEqual([m.stopBlocked, m.permissionDenied], [0, 0]);
    assert.deepEqual([m.routeSteps, m.revises, m.preanswers], [null, null, null], 'other kinds stay unknown');
  });

  it('reads gate prints and answers independently, and binds only with both', () => {
    assert.deepEqual(one(route, print).gates, { prints: { declared: 1 }, answers: null, bound: null, unbound: null }, 'a print is not a recorded answer');
    assert.deepEqual(one(route, answer).gates, { prints: null, answers: { prompt: 1 }, bound: null, unbound: 0 }, 'an answer alone cannot be bound');
    assert.deepEqual(one(route, { ...answer, unbound: true }).gates, { prints: null, answers: {}, bound: null, unbound: 1 });
    assert.deepEqual(one(route, print, answer).gates, { prints: { declared: 1 }, answers: { prompt: 1 }, bound: 1, unbound: 0 });
    assert.deepEqual(one(route, print, { ...answer, instance: 'elsewhere' }).gates, { prints: { declared: 1 }, answers: { prompt: 1 }, bound: 0, unbound: 0 }, 'recorded, none matched: zero');
    assert.equal(one(print, answer).gates, null, 'without a route the gates are route-scoped and unknown');
  });

  it('keeps a recorded zero distinct from an unknown in a ledger with no route', () => {
    const m = one({ kind: 'note' });
    assert.deepEqual([m.routes, m.routeSteps, m.preanswers, m.stopBlocked], [0, null, null, null]);
  });

  it('keeps incomplete evidence null whatever the records say', () => {
    const m = ledgerMetrics([{ entries: [route, step, preanswer, { kind: 'exit', reason: 'done' }], unreadable: 1 }]);
    for (const key of MEASURES) assert.equal(m[key], null, key);
  });
});

describe('ledger-metrics: red/green scope contract', () => {
  const route = { id: 'r-1', kind: 'route', skill: 'task' };
  const check = (phase, failed, only) => ({ kind: 'check', route: 'r-1', key: 'web/unit', ...(only === undefined ? {} : { only }), phase, exit: failed ? 1 : 0, summary: { ran: 2, failed } });
  const result = (red, green) => ledgerMetrics([{ entries: [route, check('red', 1, red), check('green', 0, green)], unreadable: 0 }]).checkRedGreen;

  it('refuses a scope that is not a flat array of strings, on either check', () => {
    for (const bad of [[null], [1], [{ file: 'a' }], [['a.spec.ts']], ['a.spec.ts', null], ['a.spec.ts', 2], null, 'a.spec.ts', 7, { 0: 'a.spec.ts' }]) {
      for (const [red, green] of [[bad, bad], [bad, ['a.spec.ts']], [['a.spec.ts'], bad]]) {
        const r = result(red, green);
        assert.equal(r.proven, false, JSON.stringify(bad));
        assert.ok(r.malformed >= 1, `${JSON.stringify(bad)} is counted malformed`);
      }
    }
    assert.deepEqual(result([null], [null]), { checks: 2, red: 0, green: 0, malformed: 2, unassociated: 0, proven: false }, 'a malformed check counts as neither red nor green');
  });

  it('still proves valid string scopes in any order, the whole suite, and nothing across scopes', () => {
    assert.equal(result(['b', 'a'], ['a', 'b']).proven, true);
    assert.equal(result([], []).proven, true, 'an empty scope is the whole suite');
    assert.equal(result(undefined, []).proven, true, 'absent and empty are the same scope');
    assert.equal(result(['a'], ['b']).proven, false);
    assert.equal(result(['a'], ['a', 'b']).proven, false);
    assert.equal(result(['a'], ['a']).malformed, 0);
  });
});

describe('ledger-metrics: harvested ledgers', () => {
  it('finds a run\'s ledgers in any of several trace directories, as the gate passes them with a baseline', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ledgers-of-'));
    try {
      const [own, baseline] = [path.join(root, 'own'), path.join(root, 'baseline')];
      mkdirSync(path.join(baseline, LEDGER_DIRECTORY, 'e-abc', 'task', 'T-1'), { recursive: true });
      writeFileSync(path.join(baseline, LEDGER_DIRECTORY, 'e-abc', 'task', 'T-1', 'ledger.jsonl'), '{"kind":"note"}\n');
      const run = { tracePath: '/private/tmp/e-abc/out/trace.jsonl' };
      assert.deepEqual(ledgersOf(run, [own, baseline]).map((ledger) => ledger.entries.length), [1]);
      assert.equal(ledgersOf(run, own), null);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
