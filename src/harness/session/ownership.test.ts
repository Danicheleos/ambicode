import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { ownerOf } from './ownership.ts';
import type { LedgerEntry } from '#types/modules/evidence';

const at = '2026-10-05T10:00:00.000Z';
const route = (id: string, session: string, extra: Record<string, unknown> = {}): LedgerEntry => ({ id, at, kind: 'route', skill: 'plan', session, ...extra });
const exit = (id: string, routeId: unknown, reason = 'done'): LedgerEntry => ({ id, at, kind: 'exit', route: routeId, reason });

describe('ownerOf: the live plan chain and its latest session', () => {
  it('no plan route is no owner; legacy and other-skill entries never own', () => {
    assert.deepEqual(ownerOf([], 'T'), { task: 'T', state: 'none' });
    const legacy: LedgerEntry[] = [
      { id: 'L1', at, kind: 'note', note: 'plan', path: 'plan_x.md' },
      { id: 'L2', at, kind: 'acceptance', gate: 'plan-accept' },
      { id: 'a-1', at, kind: 'route', skill: 'investigate', session: 'A' },
    ];
    assert.deepEqual(ownerOf(legacy, 'T'), { task: 'T', state: 'none' });
  });

  it('a started plan route is owned by its session', () => {
    assert.deepEqual(ownerOf([route('a-1', 'A')], 'T'), { task: 'T', state: 'owned', session: 'A', routeId: 'a-1', chainIds: ['a-1'], takenOver: [] });
  });

  it('--adopt moves ownership to the adopting session and marks the former one taken over', () => {
    const owner = ownerOf([route('a-1', 'A'), route('b-1', 'B', { resumes: 'a-1', adopts: true })], 'T');
    assert.deepEqual(owner, { task: 'T', state: 'owned', session: 'B', routeId: 'b-1', chainIds: ['a-1', 'b-1'], takenOver: ['A'] });
  });

  it('a same-session resume keeps the owner and takes over nobody', () => {
    const owner = ownerOf([route('a-1', 'A'), route('a-5', 'A', { resumes: 'a-1' })], 'T');
    assert.equal(owner.state === 'owned' && owner.session, 'A');
    assert.deepEqual(owner.state === 'owned' && owner.takenOver, []);
  });

  it('--fresh supersedes the old chain; its sessions are taken over by the new owner', () => {
    const owner = ownerOf([route('a-1', 'A'), exit('b-1', 'a-1', 'superseded'), route('b-2', 'B')], 'T');
    assert.deepEqual(owner, { task: 'T', state: 'owned', session: 'B', routeId: 'b-2', chainIds: ['b-2'], takenOver: ['A'] });
  });

  it('an exit on any route of the chain ends it; age is never an end', () => {
    assert.deepEqual(ownerOf([route('a-1', 'A'), route('b-1', 'B', { resumes: 'a-1', adopts: true }), exit('b-2', 'b-1')], 'T'), { task: 'T', state: 'none' });
    assert.deepEqual(ownerOf([route('a-1', 'A'), route('b-1', 'B', { resumes: 'a-1', adopts: true }), exit('a-2', 'a-1')], 'T'), { task: 'T', state: 'none' });
    const old = { ...route('a-1', 'A'), at: '2020-01-01T00:00:00.000Z' };
    assert.equal(ownerOf([old], 'T').state, 'owned');
  });

  it('an exit of another skill route leaves the plan chain alone', () => {
    const investigate: LedgerEntry = { id: 'a-2', at, kind: 'route', skill: 'investigate', session: 'A' };
    assert.equal(ownerOf([route('a-1', 'A'), investigate, exit('a-3', 'a-2')], 'T').state, 'owned');
  });

  it('valid unrelated routes, unknown kinds and records without ownership fields stay compatible', () => {
    const entries: LedgerEntry[] = [
      { id: 'L1', at, kind: 'note', note: 'plan-draft', path: 'x.md' },
      { id: 'L2', at, kind: 'future-kind', skill: 7, session: 9, route: 'nowhere' },
      route('a-1', 'A'),
      { id: 'b-1', at, kind: 'route', skill: 'review' },
      { id: 'b-2', at, kind: 'route', skill: 'investigate', session: 'B', resumes: 'b-1', adopts: true },
      exit('b-3', 'b-2'),
    ];
    assert.equal(ownerOf(entries, 'T').state, 'owned');
  });

  it('a new start after an ended chain is owned by its session', () => {
    const owner = ownerOf([route('a-1', 'A'), exit('a-2', 'a-1'), route('b-1', 'B')], 'T');
    assert.equal(owner.state === 'owned' && owner.session, 'B');
    assert.deepEqual(owner.state === 'owned' && owner.takenOver, []);
  });

  for (const [label, entries] of [
    ['a plan route without a session', [route('a-1', 'A'), { id: 'b-1', at, kind: 'route', skill: 'plan', resumes: 'a-1' }]],
    ['a resume of an unknown route', [route('a-1', 'A'), route('b-1', 'B', { resumes: 'zz-1' })]],
    ['a forward resume', [route('b-1', 'B', { resumes: 'a-1' }), route('a-1', 'A')]],
    ['a resume that is not a string', [route('a-1', 'A'), route('b-1', 'B', { resumes: 1 })]],
    ['a resume of an ended chain', [route('a-1', 'A'), exit('a-2', 'a-1'), route('b-1', 'B', { resumes: 'a-1' })]],
    ['a repeated ledger id', [route('a-1', 'A'), route('a-1', 'B')]],
    ['two live chains at once', [route('a-1', 'A'), route('b-1', 'B')]],
    ['a later route without a skill', [route('a-1', 'A'), { id: 'b-1', at, kind: 'route', session: 'B', resumes: 'a-1', adopts: true }]],
    ['a later route with a numeric skill', [route('a-1', 'A'), { id: 'b-1', at, kind: 'route', skill: 7, session: 'B', resumes: 'a-1', adopts: true }]],
    ['a route with an empty skill', [route('a-1', 'A'), { id: 'b-1', at, kind: 'route', skill: '', session: 'B' }]],
    ['a route with a numeric session', [route('a-1', 'A'), { id: 'b-1', at, kind: 'route', skill: 'investigate', session: 4 }]],
    ['a plan route with an empty session', [route('a-1', 'A'), route('b-1', '', { resumes: 'a-1' })]],
    ['a route whose adopts is not a boolean', [route('a-1', 'A'), route('b-1', 'B', { resumes: 'a-1', adopts: 'yes' })]],
    ['another skill resuming a plan route', [route('a-1', 'A'), { id: 'b-1', at, kind: 'route', skill: 'review', session: 'B', resumes: 'a-1' }]],
    ['an exit without a route', [route('a-1', 'A'), exit('a-2', undefined)]],
    ['an exit naming an unknown route', [route('a-1', 'A'), exit('a-2', 'zz-9')]],
    ['an exit naming a route after it', [exit('a-0', 'a-1'), route('a-1', 'A')]],
    ['an exit whose route is not a string', [route('a-1', 'A'), exit('a-2', 1)]],
    ['an exit whose reason is not a string', [route('a-1', 'A'), { id: 'a-2', at, kind: 'exit', route: 'a-1', reason: 5 }]],
    ['an entry without an id', [route('a-1', 'A'), { at, kind: 'route', skill: 'plan', session: 'B' } as unknown as LedgerEntry]],
  ] as [string, LedgerEntry[]][]) {
    it(`${label} is unknown, never a guess`, () => {
      assert.equal(ownerOf(entries, 'T').state, 'unknown');
    });
  }
});

describe('the ownership module', () => {
  it('has only type imports, so the guard can bundle it without the Runtime', () => {
    const source = readFileSync(new URL('./ownership.ts', import.meta.url), 'utf8');
    for (const line of source.split('\n').filter((text) => /^\s*import\s/.test(text))) assert.match(line, /^import type /);
  });
});
