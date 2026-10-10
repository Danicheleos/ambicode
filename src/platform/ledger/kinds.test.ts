import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseEntry, type Kind } from './kinds.ts';
import { KINDS } from '#types/modules/evidence';

const REF = { kind: 'note', value: 'plan-draft', id: 'a1b2c3d4-3', path: 'plan-draft_x.md', contentHash: 'sha256:x' };
const ANSWER = { route: 'a1b2c3d4-1', gate: 'plan-accept', instance: 'a1b2c3d4-4', answer: 'Accept', via: 'hook' };
const CHECK = { key: 'web/unit', argv: ['npm', 'test'], only: [], exit: 0, phase: 'green', ms: 40 };

/** One valid record per kind, and one that breaks exactly one rule of its row. */
const TABLE: Record<Kind, { valid: object; invalid: object }> = {
  route: {
    valid: { skill: 'plan', args: 'x', mode: 'interactive', channel: 'hook', trusted: true, session: 'a1b2c3d4', epoch: 1 },
    invalid: { skill: 'plan', args: 'x', mode: 'interactive', channel: 'cli', trusted: true, session: 'a1b2c3d4', epoch: 1 },
  },
  step: {
    valid: { route: 'a1b2c3d4-1', step: 'ground', actor: 'code', status: 'completed', cause: 'route-next' },
    invalid: { route: 'a1b2c3d4-1', step: 'ground', actor: 'code', status: 'done', cause: 'route-next' },
  },
  gate: {
    valid: { route: 'a1b2c3d4-1', gate: 'plan-accept', class: 'declared', question: 'q', print: 1, object: REF },
    invalid: { route: 'a1b2c3d4-1', gate: 'plan-accept', class: 'declared', question: 'q', print: 0 },
  },
  acceptance: { valid: { ...ANSWER, object: REF }, invalid: { ...ANSWER, via: 'telepathy' } },
  declined: { valid: { ...ANSWER, answer: 'run', via: 'flag', reason: 'acting-needs-human' }, invalid: { ...ANSWER, instance: undefined } },
  'default-taken': { valid: { ...ANSWER, instance: null, via: 'never-asked' }, invalid: { gate: 'plan-accept', instance: null, answer: 'x', via: 'headless' } },
  preanswer: {
    valid: { route: 'a1b2c3d4-1', gate: 'review-offer', option: 'run', via: 'prompt', trusted: true },
    invalid: { route: 'a1b2c3d4-1', gate: 'review-offer', option: 'run', via: 'flag', trusted: true },
  },
  revise: {
    valid: { route: 'a1b2c3d4-1', from: 'plan-write', via: 'code', cycle: 1, reason: 'bad anchors' },
    invalid: { route: 'a1b2c3d4-1', from: 'plan-write', via: 'robot', cycle: 1, reason: 'bad anchors' },
  },
  limit: { valid: { route: 'a1b2c3d4-1', which: 'repeat', count: 2, step: 'ground' }, invalid: { route: 'a1b2c3d4-1', which: 'repeat' } },
  exit: { valid: { route: 'a1b2c3d4-1', reason: 'done' }, invalid: { reason: 'done' } },
  requirement: {
    valid: { key: 'ORD-17', via: 'mcp', rawHash: 'sha256:x', bytes: 10, relation: 'asked', capture: 'requirements/ORD-17.json', derivedFrom: null },
    invalid: { key: 'ORD-17', via: 'mcp', rawHash: 'sha256:x', bytes: 10, capture: 'requirements/ORD-17.json' },
  },
  envelope: {
    valid: { sources: [], builtFrom: 'captures', asked: ['ORD-17'], missingAsked: [], hash: 'sha256:x' },
    invalid: { builtFrom: 'captures', asked: ['ORD-17'], missingAsked: [], hash: 'sha256:x' },
  },
  map: { valid: { mode: 'prompt', layers: [{ name: 'shortlist', ms: 1, hits: 2 }], layersSource: 'default', terms: { pass1: ['a'], pass2: [] }, candidates: 3, limitations: [], collisions: [], index: 'none', bytes: 4210 }, invalid: { bytes: 'many' } },
  search: { valid: { command: 'refs', names: ['a'], hits: 4, bytes: 300 }, invalid: { command: 'locate' } },
  policy: { valid: { stage: 'before-work', packs: [], rules: 0, omitted: 0, bytes: 10 }, invalid: { stage: ['before-work'] } },
  baseline: { valid: { head: 'a1b2c3d', dirty: [{ path: 'README.md', hash: 'sha256:x' }] }, invalid: { head: null, dirty: ['README.md'] } },
  check: { valid: CHECK, invalid: { ...CHECK, exit: 'zero' } },
  format: { valid: { key: 'web/format', files: [], exit: 0, via: 'model', outcome: 'formatted' }, invalid: { key: 'web/format', files: [], exit: null, via: 'model', outcome: 'skipped' } },
  review: { valid: { reviewId: 'local_2026', status: 'complete', reviewerRan: true, findings: 2, omissions: 0 }, invalid: { status: 'complete' } },
  worker: { valid: { worker: 'plan-checker', outcome: 'ran', ms: 5, artifact: 'workers/x.json', costUsd: 0.1 }, invalid: { outcome: 'ok', ms: 5, artifact: 'x' } },
  note: { valid: { note: 'plan', path: 'plan_x.md', contentHash: 'sha256:x', promotedFrom: 'a1b2c3d4-3' }, invalid: { note: 'draft', path: 'plan_x.md', contentHash: 'sha256:x' } },
  capture: { valid: { what: 'mr-diff', path: '.ambicode/task/t/reviews/mr-diff.patch', rawHash: 'sha256:x', bytes: 10, tool: 'mcp__gitlab__get_merge_request_diffs' }, invalid: { what: 'other', path: 'x', rawHash: 'sha256:x', bytes: 10, tool: 't' } },
};
const common = { id: 'a1b2c3d4-9', at: '2026-10-05T10:00:00.000Z' };

describe('the 22 ledger kinds', () => {
  it('02-K1: the table covers every kind', () => {
    assert.equal(KINDS.length, 22);
    assert.deepEqual(Object.keys(TABLE).sort(), [...KINDS].sort());
  });

  for (const kind of KINDS) {
    it(`02-K1: ${kind} accepts its row and rejects a record that breaks it`, () => {
      assert.equal(parseEntry({ ...common, kind, ...TABLE[kind].valid }).ok, true);
      const rejected = parseEntry({ ...common, kind, ...TABLE[kind].invalid });
      assert.deepEqual([rejected.ok, rejected.ok ? null : rejected.unknownKind], [false, false]);
    });
  }

  it('02-K1: an id of neither shape is rejected, and an unknown kind is skipped, not rejected', () => {
    assert.equal(parseEntry({ ...common, id: 'nope', kind: 'exit', route: 'r', reason: 'x' }).ok, false);
    assert.deepEqual(parseEntry({ ...common, kind: 'from-the-future' }), { ok: false, unknownKind: true });
    assert.deepEqual(parseEntry([1]), { ok: false, unknownKind: false, reason: 'not a JSON object' });
  });

  it('02-K1: an answer is bound to a route unless it is unbound', () => {
    const { route: _route, ...routeless } = ANSWER;
    assert.equal(parseEntry({ ...common, kind: 'acceptance', ...routeless }).ok, false);
    assert.equal(parseEntry({ ...common, kind: 'acceptance', ...routeless, unbound: true }).ok, true);
  });

  it('02-K2: legacy note and review records still parse, and old and new ids share a ledger', () => {
    for (const note of ['plan', 'investigation', 'notes']) {
      assert.equal(parseEntry({ id: 'L3', at: 't', kind: 'note', note, path: 'p', contentHash: 'h' }).ok, true);
    }
    const legacyReview = { id: 'L4', at: 't', kind: 'review', reviewId: 'r', status: 'complete', statusReason: 's', reviewerRan: true, findings: 1, omissions: 0, checks: [], waiting: [] };
    assert.equal(parseEntry(legacyReview).ok, true);
    assert.equal(parseEntry({ ...legacyReview, statusReason: null }).ok, true, 'the review writer records a null statusReason');
    assert.equal(parseEntry({ ...common, kind: 'note', ...TABLE.note.valid }).ok, true);
  });

  it('02-K5: a field outside the schema is preserved on read and grants nothing', () => {
    const parsed = parseEntry({ ...common, kind: 'acceptance', ...ANSWER, via: 'flag', authority: 'honoured', trustedByEveryone: true });
    assert.equal(parsed.ok && parsed.entry.authority, 'honoured');
    assert.equal(parsed.ok && parsed.entry.via, 'flag');
  });

  it('03: the added fields are accepted and malformed ones rejected', () => {
    const ok = (kind: string, body: object) => parseEntry({ ...common, kind, ...body }).ok;
    const route = { skill: 'plan', args: 'x', mode: 'interactive', channel: 'hook', trusted: true, session: 'a1b2c3d4', epoch: 1 };
    assert.equal(ok('route', route), true);
    assert.equal(ok('exit', { route: 'r', reason: 'dismissed', complete: true, unverified: 2 }), true);
    assert.equal(ok('exit', { route: 'r', reason: 'done', unverified: -1 }), false);
    assert.equal(ok('exit', { route: 'r', reason: 'done', complete: 'yes' }), false);
    const step = { ...TABLE.step.valid, revise: { a: 1 }, exit: 'done' };
    assert.equal(ok('step', step), true);
    assert.equal(ok('step', { ...step, exit: 0 }), false);
  });

  it('03: ledgers written before the new fields and kinds still parse', () => {
    assert.equal(parseEntry({ id: 'L1', at: 't', kind: 'exit', route: 'r', reason: 'done' }).ok, true);
    assert.equal(parseEntry({ id: 'L2', at: 't', kind: 'step', route: 'r', step: 's', actor: 'code', status: 'completed', cause: 'c' }).ok, true);
    assert.equal(parseEntry({ id: 'L3', at: 't', kind: 'limit', route: 'r', which: 'repeat', count: 1 }).ok, true);
  });
});
