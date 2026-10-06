import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { navigationLine } from './navigation-line.ts';
import { buildReport } from './report.ts';
import { contentHash } from '#util/hash';
import type { LedgerEntry } from '#types/evidence';

let counter = 0;
const entry = (kind: string, fields: object = {}): LedgerEntry => ({ id: `a1b2c3d4-${(counter += 1)}`, at: '2026-10-05T10:00:00.000Z', kind, ...fields });
const check = (fields: object): LedgerEntry => entry('check', { key: 'web/unit', argv: ['npm', 'test'], only: [], exit: 0, phase: 'green', summary: { ran: 3, failed: 0 }, ms: 10, ...fields });
const route = (fields: object = {}): LedgerEntry => entry('route', { skill: 'task', args: 'x', mode: 'interactive', channel: 'hook', trusted: true, session: 'a1b2c3d4', epoch: 1, ...fields });

describe('02-R1: the report skeleton', () => {
  it('prints every Evidence line in order, "none recorded" for an empty one, and a hash comment', () => {
    const report = buildReport([]);
    const names = report.evidence.split('\n').map((line) => line.trim().split(':')[0]);
    assert.deepEqual(names, ['Evidence', 'Requirements', 'Map', 'Navigation (CLI calls)', 'Baseline', 'Checks', 'Review', 'Decisions', 'Revisions']);
    for (const name of ['Requirements', 'Map', 'Baseline', 'Checks', 'Review', 'Decisions', 'Revisions']) assert.match(report.evidence, new RegExp(`  ${name}: none recorded`));
    assert.equal(report.notVerified, 'Not verified\n  none recorded');
    assert.equal(report.hash, contentHash(`${report.evidence}\n${report.notVerified}`));
    assert.ok(report.text.endsWith(`\n<!-- ambicode report ${report.hash} -->`));
    assert.ok(report.text.startsWith(`${report.evidence}\n${report.notVerified}\n`));
  });

  it('shows what is recorded on each line', () => {
    const report = buildReport([
      entry('requirement', { key: 'ORD-17', via: 'mcp', rawHash: 'h', bytes: 1, relation: 'asked', capture: 'c' }),
      entry('envelope', { sources: [{ key: 'ORD-17' }], builtFrom: 'captures', asked: ['ORD-17'], missingAsked: [], server: 'atlassian', hash: 'h' }),
      entry('map', { layers: [{ name: 'shortlist' }, { name: 'harvest' }], collisions: ['validate'], index: 'none' }),
      entry('baseline', { head: 'a1b2c3d4e5f6', dirty: ['README.md'] }),
      check({ phase: 'red', exit: 1, summary: { ran: 1, failed: 1 }, only: ['a.spec.ts'] }),
      check({ only: ['a.spec.ts'] }),
      entry('review', { reviewId: 'local_1', status: 'complete', reviewerRan: true, findings: 2, omissions: 0 }),
      entry('acceptance', { route: 'r', gate: 'plan-accept', instance: 'i', answer: 'Accept', via: 'hook' }),
      entry('revise', { route: 'r', from: 'plan-write', via: 'code', cycle: 1, reason: '2 bad anchors' }),
      entry('revise', { route: 'r', from: 'plan-write', via: 'code', cycle: 2, reason: 'none left' }),
    ]);
    assert.match(report.evidence, /Requirements: 1 source\(s\) from captures \(ORD-17\) via atlassian; ORD-17 \(asked\)/);
    assert.match(report.evidence, /Map: layers shortlist→harvest, 1 colliding names, index none/);
    assert.match(report.evidence, /Baseline: a1b2c3d4e5f6, dirty: README\.md/);
    assert.match(report.evidence, /Checks: web\/unit --only a\.spec\.ts: red exit 1 \(1 ran, 1 failed\) → green exit 0 \(3 ran, 0 failed\)/);
    assert.match(report.evidence, /Review: local_1 complete, 2 findings/);
    assert.match(report.evidence, /Decisions: plan-accept "Accept" \(via hook\)/);
    assert.match(report.evidence, /Revisions: plan-write ×2 \(last: none left\)/);
    assert.equal(report.notVerified, 'Not verified\n  none recorded');
  });
});

describe('02-R2: checks never claim more than the ledger says', () => {
  it('a missing test count, zero tests, a nonzero last exit and a declined key are not verified', () => {
    const report = buildReport([
      check({ key: 'api/lint', summary: null }),
      check({ key: 'web/unit', summary: { ran: 0, failed: 0 } }),
      check({ key: 'web/e2e', phase: 'red', exit: 2, summary: { ran: 4, failed: 1 } }),
      entry('declined', { route: 'r', gate: 'check:web/slow', instance: null, answer: 'no', via: 'flag', reason: 'acting-needs-human' }),
    ]);
    assert.match(report.notVerified, /api\/lint: test count unknown/);
    assert.match(report.notVerified, /web\/unit: no tests ran/);
    assert.match(report.notVerified, /web\/e2e: last run exited 2/);
    assert.match(report.notVerified, /check:web\/slow: declined "no" \(acting-needs-human\)/);
    assert.doesNotMatch(report.evidence, /passed/);
    assert.match(report.evidence, /api\/lint: green exit 0; web\/unit/);
  });

  it('a delivery, a completion or an exit code alone is not a test result', () => {
    const report = buildReport([entry('step', { route: 'r', step: 'fix', actor: 'model', status: 'completed', cause: 'route-next' }), entry('exit', { route: 'r', reason: 'done' })]);
    assert.match(report.evidence, /Checks: none recorded/);
    assert.doesNotMatch(report.text, /\bpassed\b|green/);
  });

  it('only the last run of a key decides whether it is verified', () => {
    const report = buildReport([check({ phase: 'red', exit: 1, summary: null }), check({})]);
    assert.equal(report.notVerified, 'Not verified\n  none recorded');
  });
});

describe('02-R3: what was skipped, declined or limited is visible', () => {
  it('lists declines, defaults with their via, limits, missing sources, a reviewer that did not run and a model-set headless', () => {
    const report = buildReport([
      route({ mode: 'headless', channel: 'cli', trusted: false }),
      entry('declined', { route: 'r', gate: 'review-offer', instance: null, answer: 'run', via: 'flag', reason: 'acting-needs-human' }),
      entry('default-taken', { route: 'r', gate: 'scope', instance: null, answer: 'out of scope', via: 'never-asked' }),
      entry('default-taken', { route: 'r', gate: 'plan-accept', instance: null, answer: 'Reject', via: 'headless' }),
      entry('limit', { route: 'r', which: 'repeat', count: 2, step: 'ground' }),
      entry('envelope', { sources: [], builtFrom: 'args', asked: ['A-1', 'A-2'], missingAsked: ['A-2'], hash: 'h' }),
      entry('review', { reviewId: 'local_2', status: 'partial', reviewerRan: false, findings: 0, omissions: 3 }),
    ]);
    for (const expected of [
      /review-offer: declined "run" \(acting-needs-human\)/,
      /scope: default taken, "out of scope" \(never-asked\)/,
      /plan-accept: default taken, "Reject" \(headless\)/,
      /repeat limit \(2\) at ground/,
      /Requirement not captured: A-2/,
      /Review local_2: the reviewer did not run, status partial, 3 omissions/,
      /headless set by an untrusted start/,
    ]) assert.match(report.notVerified, expected);
  });

  it('a trusted headless start and a complete review are not listed', () => {
    const report = buildReport([route({ mode: 'headless', channel: 'harness', trusted: true }), entry('review', { reviewId: 'r', status: 'complete', reviewerRan: true })]);
    assert.equal(report.notVerified, 'Not verified\n  none recorded');
  });
});

describe('02-R4: historical evidence is labelled', () => {
  it('suffixes an entry that is not current, in both blocks, and every entry is current without the option', () => {
    const old = check({ phase: 'red', exit: 1, summary: null });
    const stale = entry('declined', { route: 'r', gate: 'g', instance: null, answer: 'no', via: 'flag' });
    const entries = [old, stale, check({ key: 'web/other' })];
    const report = buildReport(entries, { current: (candidate) => candidate.id !== old.id && candidate.id !== stale.id });
    assert.match(report.evidence, /red exit 1 \(historical\)/);
    assert.match(report.evidence, /g declined "no" \(via flag\) \(historical\)/);
    assert.match(report.notVerified, /web\/unit: test count unknown \(exit code only\) \(historical\)/);
    assert.match(report.evidence, /web\/other: green exit 0 \(3 ran, 0 failed\)\n/);
    assert.doesNotMatch(buildReport(entries).text, /historical/);
  });
});

describe('02-R5: the same entries give the same bytes, in a small space', () => {
  const twenty = (): LedgerEntry[] => [
    route(),
    entry('requirement', { key: 'ORD-17', via: 'mcp', rawHash: 'h', bytes: 1, relation: 'asked', capture: 'c' }),
    entry('envelope', { sources: [{ key: 'ORD-17' }], builtFrom: 'captures', asked: ['ORD-17'], missingAsked: [], server: 'atlassian', hash: 'h' }),
    entry('map', { layers: [{ name: 'shortlist' }], collisions: [], index: 'none' }),
    entry('search', { command: 'refs', names: ['a', 'b', 'c'] }),
    entry('search', { command: 'find' }),
    entry('baseline', { head: 'a1b2c3d4', dirty: ['README.md'] }),
    check({ phase: 'red', exit: 1, summary: { ran: 1, failed: 1 } }),
    check({}),
    check({ key: 'web/e2e', summary: null }),
    entry('review', { reviewId: 'local_2026-10-03T11-02', status: 'complete', reviewerRan: true, findings: 2, omissions: 1 }),
    entry('gate', { route: 'r', gate: 'plan-accept', class: 'declared', question: 'q', print: 1 }),
    entry('acceptance', { route: 'r', gate: 'plan-accept', instance: 'i', answer: 'Accept', via: 'hook' }),
    entry('preanswer', { route: 'r', gate: 'review-offer', option: 'run', via: 'prompt', trusted: true }),
    entry('revise', { route: 'r', from: 'plan-write', via: 'code', cycle: 1, reason: 'plan check: 2 bad anchors' }),
    entry('revise', { route: 'r', from: 'design', via: 'model', cycle: 1, reason: 'scope moved' }),
    entry('default-taken', { route: 'r', gate: 'scope', instance: null, answer: 'out of scope', via: 'never-asked' }),
    entry('limit', { route: 'r', which: 'repeat', count: 2, step: 'ground' }),
    entry('declined', { route: 'r', gate: 'web/e2e', instance: null, answer: 'no', via: 'flag' }),
    entry('step', { route: 'r', step: 'fix', actor: 'model', status: 'completed', cause: 'route-next' }),
  ];

  it('is byte-identical for the same entries and at most 3,072 bytes for 20 typical ones', () => {
    assert.equal(twenty().length, 20);
    const first = buildReport(twenty());
    assert.equal(buildReport(twenty()).text, first.text);
    assert.ok(Buffer.byteLength(first.text) <= 3072, `${Buffer.byteLength(first.text)} bytes`);
  });
});

describe('02-R6: the navigation line reads search entries only', () => {
  it('counts calls per command and names, and says model reads are not recorded', () => {
    const line = navigationLine([entry('search', { command: 'refs', names: ['a', 'b', 'c'] }), entry('search', { command: 'find' }), entry('search', { command: 'find' }), entry('map', {})]);
    assert.equal(line, 'Navigation (CLI calls): refs x1 (3 names), find x2 — model reads not recorded');
    assert.equal(navigationLine([entry('map', {})]), 'Navigation (CLI calls): none recorded — model reads not recorded');
    assert.match(buildReport([entry('search', { command: 'find' })]).evidence, /\n {2}Navigation \(CLI calls\): find x1 — model reads not recorded\n/);
  });
});

describe('03-E12: the report leads with how the route ended', () => {
  const at = '2026-10-05T10:00:00.000Z';
  const route = { id: 'a-1', at, kind: 'route', skill: 'plan', mode: 'interactive', channel: 'hook' };

  it('no route entry means no leading line; a route without exit is in progress', () => {
    assert.ok(buildReport([]).text.startsWith('Evidence'));
    assert.equal(buildReport([route]).status, 'in progress');
  });

  it('a complete exit leads with complete and counts what is not verified; historical items do not count', () => {
    const exit = { id: 'a-2', at, kind: 'exit', route: 'a-1', reason: 'done', complete: true };
    assert.equal(buildReport([route, exit]).status, 'complete');
    const limit = { id: 'a-3', at, kind: 'limit', which: 'repeat', step: 'plan-write', count: 2 };
    const report = buildReport([route, limit, exit], { complete: true });
    assert.equal(report.status, 'complete, 1 items not verified');
    assert.ok(report.text.startsWith('complete, 1 items not verified\nEvidence'));
    assert.equal(buildReport([route, limit, exit], { complete: true, current: () => false }).status, 'complete');
  });

  it('an exit leads with its reason; permission-denied keeps its detail', () => {
    const exit = { id: 'a-2', at, kind: 'exit', route: 'a-1', reason: 'blocked', detail: 'permission-denied: git push' };
    assert.equal(buildReport([route, exit]).status, 'ended: blocked (permission-denied: git push)');
    assert.equal(buildReport([route, { ...exit, detail: undefined }]).status, 'ended: blocked');
  });

  it('the hash covers the evidence only: the leading line does not change it', () => {
    const exit = { id: 'a-2', at, kind: 'exit', route: 'a-1', reason: 'blocked' };
    assert.equal(buildReport([route]).hash, buildReport([route, exit]).hash);
  });
});

describe('04-R1: the Requirements line names where the envelope came from', () => {
  const envelope = (fields: object): LedgerEntry => entry('envelope', { sources: [], builtFrom: 'args', asked: [], missingAsked: [], hash: 'h', ...fields });

  it('04-R1: captures name the count, the keys and the server; args say they were not captured; missing keys follow', () => {
    const captured = buildReport([envelope({ builtFrom: 'captures', sources: [{ key: 'ORD-17' }, { key: 'ORD-30' }], server: 'atlassian', missingAsked: ['ORD-18'] })]);
    assert.match(captured.evidence, /Requirements: 2 source\(s\) from captures \(ORD-17, ORD-30\) via atlassian; missing: ORD-18/);
    assert.match(captured.notVerified, /Requirement not captured: ORD-18/);
    const args = buildReport([envelope({ sources: [{ key: 'ARGS' }] })]);
    assert.match(args.evidence, /Requirements: built from the args text \(not captured\)\n/);
    assert.doesNotMatch(args.evidence, /missing:/);
    assert.match(buildReport([envelope({ missingAsked: ['ORD-9'] })]).evidence, /Requirements: built from the args text \(not captured\); missing: ORD-9/);
  });
});

describe('07-R9: Not verified for the task route', () => {
  const offer = (kind: string, answer: string, fields: object = {}): LedgerEntry => entry(kind, { route: 'r', gate: 'review-offer', instance: null, answer, via: 'headless', ...fields });

  it('07-R9: a bound acceptance or a default-taken review-offer starting with skip is listed; run is not', () => {
    const skipped = 'independent review skipped — verification incomplete';
    assert.match(buildReport([offer('acceptance', 'skip — verification incomplete', { instance: 'i', via: 'hook' })]).notVerified, new RegExp(skipped));
    assert.match(buildReport([offer('default-taken', 'skip — verification incomplete')]).notVerified, new RegExp(skipped));
    assert.doesNotMatch(buildReport([offer('acceptance', 'run', { instance: 'i', via: 'hook' })]).notVerified, /skipped/);
  });

  it('07-R9: an unbound skip answer is not counted as a bound one', () => {
    const report = buildReport([offer('acceptance', 'skip — verification incomplete', { instance: 'i', unbound: true })]);
    assert.doesNotMatch(report.notVerified, /independent review skipped/);
  });

  it('07-R9: a format entry that is not formatted lists the key and outcome; formatted does not', () => {
    const format = (outcome: string): LedgerEntry => entry('format', { key: 'app/format', files: [], exit: null, via: 'model', outcome });
    for (const outcome of ['unconfigured', 'failed', 'refused']) assert.match(buildReport([format(outcome)]).notVerified, new RegExp(`  not formatted: app/format \\(${outcome}\\)`));
    assert.equal(buildReport([format('formatted')]).notVerified, 'Not verified\n  none recorded');
  });

  it('07-R9: limit missing-produces at red reads no-red; at another step it stays a generic limit', () => {
    assert.match(buildReport([entry('limit', { which: 'missing-produces', step: 'red', count: 3 })]).notVerified, /^ {2}no-red: no failing-first test recorded$/m);
    const other = buildReport([entry('limit', { which: 'missing-produces', step: 'green', count: 3 })]);
    assert.match(other.notVerified, /missing-produces limit \(3\) at green/);
    assert.doesNotMatch(other.notVerified, /no-red/);
  });

  it('07-R9: a failed check and an absent check or format stay in Not verified, never in a clean report', () => {
    const failed = buildReport([check({ exit: 1, summary: { ran: 2, failed: 1 } })]);
    assert.match(failed.notVerified, /web\/unit: last run exited 1/);
    const absent = buildReport([]);
    assert.match(absent.evidence, /Checks: none recorded/);
    assert.equal(absent.notVerified, 'Not verified\n  none recorded');
    assert.doesNotMatch(absent.text, /not formatted|green/);
  });
});
