import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderSummary } from './summary.ts';
import type { LedgerEntry } from '#types/modules/evidence';

let counter = 0;
const entry = (kind: string, fields: object = {}): LedgerEntry => ({ id: `a1b2c3d4-${(counter += 1)}`, at: '2026-10-05T10:00:00.000Z', kind, ...fields });

const PLAN = '.ambicode/tasks/ord-17/plan.md';
const FILES: Record<string, string> = {
  [PLAN]: '# Refund the order total\n\nPartial refunds stop overcharging, in three steps.\n\n## Iteration 1\nGuard the empty list.\n\n## Iteration 2\nSeed the reduce.\n\n## Iteration 3\nSurface the refund.\n',
  '.ambicode/tasks/ord-17/result_1.md': '# Task report\n**Done**\n- src/orders/service.ts:42 guard the empty list.\n',
  '.ambicode/tasks/ord-17/result_3.md': '# Task report\n**Done**\n- src/orders/refund.ts:9 surface the refund.\n',
};
const read = async (file: string): Promise<string | null> => FILES[file] ?? null;

const taskRoute = (id: string, iteration: number, args: object = { text: 'ORD-17', plan: null }): LedgerEntry[] => [
  entry('route', { id, skill: 'task', args, mode: 'interactive', channel: 'hook', trusted: true, session: 's', epoch: 1 }),
  entry('step', { route: id, step: 'start', status: 'completed', iteration, iterations: 3, planPath: PLAN }),
  entry('envelope', { route: id, sources: [], builtFrom: 'args', asked: ['ORD-17'], missingAsked: [] }),
  entry('map', { route: id, layers: [{ name: 'grep' }], candidates: 0, collisions: [] }),
  entry('baseline', { route: id, head: 'abc', dirty: ['a.ts', 'b.ts'] }),
];
const check = (id: string, fields: object = {}): LedgerEntry => entry('check', { route: id, key: 'app/unit', files: ['src/orders/service.ts'], exit: 0, phase: 'green', ms: 1, ...fields });
const exit = (id: string, reason: string, fields: object = {}): LedgerEntry => entry('exit', { route: id, reason, ...fields });
const review = (id: string, reviewId: string, findings: number): LedgerEntry => entry('review', { route: id, reviewId, stage: 'recorded', status: 'complete', reviewerRan: true, findings, omissions: 0 });
const formatNone = (id: string): LedgerEntry => entry('format', { route: id, key: 'app/format', files: [], exit: null, outcome: 'unconfigured' });
const result = (id: string, file: string): LedgerEntry => entry('note', { route: id, note: 'result', path: file, contentHash: 'h' });

function ledger(): LedgerEntry[] {
  const plan = entry('route', { id: 'P', skill: 'plan', args: { text: 'ORD-17', plan: null }, mode: 'interactive', channel: 'hook', trusted: true, session: 's', epoch: 1 });
  const print = entry('gate', { route: 'P', gate: 'decision:scope', class: 'decision', question: 'Plan only the UI part, or the API too?\n[ambicode gate decision:scope]', options: ['UI only', 'Both'] });
  return [
    plan,
    entry('envelope', { route: 'P', sources: [{ key: 'ORD-17' }], builtFrom: 'captures', asked: ['ORD-17'], missingAsked: [] }),
    print,
    entry('acceptance', { route: 'P', gate: 'decision:scope', instance: print.id, answer: 'UI only', via: 'hook' }),
    entry('step', { route: 'P', step: 'plan-check', status: 'failed', recorded: true, message: '1 bad anchors: src/orders/gone.ts:3 missing-file' }),
    entry('note', { route: 'P', note: 'plan', path: PLAN, contentHash: 'h' }),
    exit('P', 'done', { complete: true }),

    ...taskRoute('T1', 1),
    check('T1'),
    formatNone('T1'),
    review('T1', 'rev-1', 0),
    result('T1', '.ambicode/tasks/ord-17/result_1.md'),
    exit('T1', 'done', { complete: true }),

    // The restart after iteration 1 was stopped by the model at once: no work was done in it.
    ...taskRoute('T2a', 2),
    exit('T2a', 'human', { detail: 'user asked for iteration 1 only' }),

    ...taskRoute('T2', 2),
    check('T2', { exit: 1 }),
    check('T2'),
    formatNone('T2'),
    review('T2', 'rev-2', 1),
    review('T2', 'rev-3', 0),
    exit('T2', 'done', { complete: true }),

    ...taskRoute('T3', 3),
    check('T3', { files: ['src/orders/refund.ts'] }),
    entry('limit', { route: 'T3', which: 'check', count: 5, step: 'change' }),
    review('T3', 'rev-4', 0),
    result('T3', '.ambicode/tasks/ord-17/result_3.md'),
    exit('T3', 'done', { complete: true, unverified: 1 }),
  ];
}

describe('summary.md reads like a result, not an audit trail', () => {
  it('one row per iteration with its final status, the saved final message, checks and review; the plan and its decision on top', async () => {
    const text = await renderSummary('ord-17', ledger(), read);
    assert.match(text, /^# Task ord-17\n\nRequest: ORD-17\nRequirement: ORD-17\nPlan: \.ambicode\/tasks\/ord-17\/plan\.md\n/);
    assert.match(text, /## Plan\n[\s\S]*Refund the order total\n[\s\S]*Partial refunds stop overcharging, in three steps\.\n[\s\S]*Iteration 1\n[\s\S]*Iteration 3\n[\s\S]*Plan only the UI part, or the API too\? → UI only/);
    assert.deepEqual([...text.matchAll(/^- Iteration (\d) of 3: (.*)$/gm)].map((row) => [row[1], row[2]]), [['1', 'done'], ['2', 'done'], ['3', 'done']]);
    assert.match(text, /guard the empty list\./);
    assert.match(text, /surface the refund\./);
    assert.doesNotMatch(text, /no final message/i, 'an iteration without a closing message is not a defect line');
    assert.match(text, /app\/unit: passed/);
    assert.doesNotMatch(text, /green exit/);
    assert.match(text, /1 finding, re-review clean/);
    assert.match(text, /src\/orders\/refund\.ts/);
    assert.match(text, /^## Routes\n(?:.*\n)*?- plan · .* · done$/m, 'the plan route is one line');
  });

  it('drops Map, Baseline, Navigation, Revisions, envelope origins and review ids', async () => {
    const text = await renderSummary('ord-17', ledger(), read);
    for (const dropped of [/Map/, /Baseline/, /Navigation/, /Revisions/, /built from the args text/, /rev-\d/, /0 candidates/, /dirty/, /\(historical\)/, /## Evidence/]) assert.doesNotMatch(text, dropped);
  });

  it('states every gap once: a limit, an unverified plan anchor, and no formatter configured, nothing from the superseded stop', async () => {
    const text = await renderSummary('ord-17', ledger(), read);
    const verified = text.slice(text.indexOf('## Not verified'));
    assert.equal(verified.match(/Checks kept failing during the change: stopped after 5 attempts/g)?.length, 1);
    assert.equal(verified.match(/plan-check: 1 bad anchors/g)?.length, 1);
    assert.doesNotMatch(verified, /app\/unit/, 'the red run of iteration 2 was passed by its next run');
    assert.doesNotMatch(verified, /unconfigured|not formatted/);
    assert.equal(text.match(/no formatter configured/gi)?.length, 1);
  });

  it('a later successful route of the same iteration supersedes the gaps of the earlier one', async () => {
    const blocked = [...taskRoute('A', 2), check('A', { exit: 2 }), exit('A', 'blocked', { detail: 'user stopped' }), ...taskRoute('B', 2), check('B'), exit('B', 'done', { complete: true })];
    const text = await renderSummary('ord-17', blocked, read);
    assert.match(text, /^- Iteration 2 of 3: done$/m);
    assert.match(text, /## Not verified\nnone\n?$/);
    const only = await renderSummary('ord-17', blocked.slice(0, 7), read);
    assert.match(only, /^- Iteration 2 of 3: blocked \(user stopped\)$/m);
    assert.match(only, /app\/unit: last run exited 2/);
  });

  it('a launch that did nothing still shows when it is the only one of its iteration, with its gaps', async () => {
    const lone = [...taskRoute('A', 1), check('A'), exit('A', 'done', { complete: true }), ...taskRoute('B', 2), entry('envelope', { route: 'B', sources: [], builtFrom: 'args', asked: ['ORD-9'], missingAsked: ['ORD-9'] }), entry('declined', { route: 'B', gate: 'scope', instance: null, answer: 'no', via: 'hook', reason: 'user' }), exit('B', 'human')];
    const text = await renderSummary('ord-17', lone, read);
    assert.deepEqual([...text.matchAll(/^- Iteration (\d) of 3: (.*)$/gm)].map((row) => [row[1], row[2]]), [['1', 'done'], ['2', 'human']]);
    assert.match(text, /Requirement not captured: ORD-9/);
    assert.match(text, /scope: declined "no"/);
  });

  it('a no-work restart after a real run does not hide the real run', async () => {
    const text = await renderSummary('ord-17', [...taskRoute('A', 2), check('A'), exit('A', 'done', { complete: true }), ...taskRoute('B', 2), exit('B', 'human')], read);
    assert.deepEqual([...text.matchAll(/^- Iteration (\d) of 3: (.*)$/gm)].map((row) => [row[1], row[2]]), [['2', 'done']]);
  });

  it('a route that ran out of iterations is a route line, not "Iteration 2 of 1"', async () => {
    const out = [entry('route', { id: 'X', skill: 'task', args: { text: 'ORD-17', plan: null }, mode: 'interactive', channel: 'hook', trusted: true, session: 's', epoch: 1 }), entry('step', { route: 'X', step: 'start', status: 'completed', planPath: PLAN, iterations: 1 }), exit('X', 'iterations-complete')];
    const text = await renderSummary('ord-17', out, read);
    assert.doesNotMatch(text, /Iteration \d of/);
    assert.match(text, /^- task · .* · iterations-complete$/m);
  });

  it('a task with no checks configured adds no Not verified line', async () => {
    const text = await renderSummary('ord-17', [...taskRoute('A', 1), entry('baseline', { route: 'A', head: 'abc', dirty: [], runnable: 0 }), review('A', 'r', 0), exit('A', 'done', { complete: true })], read);
    assert.doesNotMatch(text, /nothing was verified by running checks/);
  });

  it('routes without iterations get one line and their final note; init entries are listed', async () => {
    const text = await renderSummary('init', [
      entry('route', { id: 'R', skill: 'investigate', args: { text: 'why', plan: null }, mode: 'interactive', channel: 'hook', trusted: true, session: 's', epoch: 1 }),
      entry('note', { route: 'R', note: 'investigation', path: 'inv.md', contentHash: 'h' }),
      exit('R', 'done', { complete: true }),
      entry('init', { what: 'scaffold', outcome: 'created config' }),
    ], async (file) => (file === 'inv.md' ? '# Why it is slow\nBecause of the loop.\n' : null));
    assert.match(text, /^- investigate · .* · done$/m);
    assert.match(text, /Because of the loop\./);
    assert.match(text, /## Init\n- scaffold: created config/);
  });
  it('each iteration row carries its plan title, so one that ended without a closing message still says what it was', async () => {
    const files: Record<string, string> = { ...FILES, [PLAN]: '# Refund\n\nGoal line.\n\n## Iteration 1: Guard the empty list\nx\n\n## Iteration 2 — Seed the reduce\ny\n\n## Iteration 3\nz\n' };
    const text = await renderSummary('ord-17', ledger(), async (file) => files[file] ?? null);
    assert.deepEqual([...text.matchAll(/^- Iteration (\d) of 3(?: \((.*)\))?: (.*)$/gm)].map((row) => [row[1], row[2], row[3]]), [['1', 'Guard the empty list', 'done'], ['2', 'Seed the reduce', 'done'], ['3', undefined, 'done']]);
  });
});
