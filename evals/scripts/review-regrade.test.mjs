import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { aggregate, budgeted, findingsOf, majority, markdown, matchFindings, matchPrompt, parseArray, parseVote, reportFindings, runDirs, runMetrics } from './review-regrade.mjs';
import { validate } from './review-regrade-validate.mjs';
import { PROBE_LABELS, labelledSet } from './review-regrade-labels.mjs';

const REPORT = `1. WHAT WAS REVIEWED
   mode        quality-review

2. FINDINGS

   [medium/high] policy  f1
   src/a.ts:2 (new)
     | 1: import x
     | 2: import y; <---
   Billing imports y from the domain.
   suggested comment: use the index.

   [low/medium] naming  f2
   src/a.ts:9 (new)
   Names r and f say nothing.

3. CHECKS AND VERIFICATION EVIDENCE
   No check recorded.
`;
const issues = [
  { id: 'main', main: true, category: 'team-rule', what: 'deep import', locations: [{ file: 'src/a.ts', lines: [2, 2] }], overlaps: [] },
  { id: 's1', category: 'tests', what: 'no test', locations: [{ file: 'src/a.ts', lines: [9, 9] }], overlaps: ['main'] },
  { id: 's2', category: 'tests', what: 'other', locations: [{ file: 'src/b.ts', lines: [1, 1] }], overlaps: [] },
];
const verdict = (...items) => JSON.stringify(items.map(([n, id, outside = null, reason = 'r']) => ({ n, issue_id: id, outside, reason })));
const scripted = (...replies) => {
  const prompts = [];
  const run = (prompt) => {
    prompts.push(prompt);
    return { text: replies[Math.min(prompts.length - 1, replies.length - 1)], costUsd: 0.01 };
  };
  return Object.assign(run, { prompts });
};

describe('findings of a printed report', () => {
  it('are the blocks of section 2 without the code excerpt, and none when the section is empty', () => {
    const found = reportFindings(REPORT);
    assert.equal(found.length, 2);
    assert.match(found[0], /^\[medium\/high\] policy {2}f1\nsrc\/a\.ts:2 \(new\)\nBilling imports y/);
    assert.doesNotMatch(found[0], /import x/);
    assert.deepEqual(reportFindings('2. FINDINGS\n\n   None.\n\n3. CHECKS\n'), []);
    assert.deepEqual(reportFindings('no sections here'), []);
  });

  it('a report is read without the judge, free text is enumerated by it, a record with neither has none', () => {
    const none = () => assert.fail('no call');
    assert.equal(findingsOf({ report: REPORT, finalMessage: 'x' }, none).source, 'report');
    const run = scripted('["first problem", "second"]');
    const got = findingsOf({ report: null, finalMessage: 'a review' }, run);
    assert.deepEqual(got, { source: 'judge', findings: ['first problem', 'second'], invalid: false });
    assert.equal(findingsOf({ report: null, finalMessage: 'a review' }, scripted('not json')).invalid, true);
    assert.deepEqual(findingsOf({ report: null, finalMessage: null }, none), { source: 'none', findings: [] });
  });

  it('parseArray finds the array inside prose and refuses a broken one', () => {
    assert.deepEqual(parseArray('Sure: [1, 2] done'), [1, 2]);
    assert.equal(parseArray('[1, 2'), null);
    assert.equal(parseArray('{"a":1}'), null);
  });
});

describe('a vote', () => {
  const ids = ['main', 's1'];
  it('needs a verdict for every finding and only known ids', () => {
    assert.equal(parseVote(verdict([1, 'main']), 2, ids), null);
    assert.equal(parseVote(verdict([1, 'main'], [2, 'zzz']), 2, ids), null);
    assert.equal(parseVote('nonsense', 1, ids), null);
    const vote = parseVote(verdict([1, 'main'], [2, null, 'real', 'why']), 2, ids);
    assert.deepEqual(vote.map((v) => [v.issue, v.outside]), [[['main'], null], [[], 'real']]);
  });

  it('keeps an outside label only for a finding that credits no issue, and drops an unknown label', () => {
    const vote = parseVote(verdict([1, 'main', 'real'], [2, null, 'weird']), 2, ids);
    assert.deepEqual(vote.map((v) => v.outside), [null, null]);
  });

  it('accepts two ids for one finding (the matcher is told only declared overlaps allow it)', () => {
    assert.deepEqual(parseVote(JSON.stringify([{ n: 1, issue_id: ['main', 's1'], reason: '' }]), 1, ids)[0].issue, ['main', 's1']);
  });
});

describe('majority over votes', () => {
  const vote = (...pairs) => pairs.map(([id, outside]) => ({ issue: id === null ? [] : [id], outside: outside ?? null, reason: 'r' }));
  it('takes the plurality per finding and ignores an invalid vote', () => {
    const got = majority([vote(['main'], [null, 'real']), vote(['main'], [null, 'arguable']), vote(['s1'], [null, 'real']), null, vote(['main'], [null, 'real'])], 2);
    assert.deepEqual(got.map((m) => [m.issue, m.outside, m.votes]), [[['main'], null, 4], [[], 'real', 4]]);
    assert.equal(got[0].reasons.length, 4);
  });

  it('a tie credits nothing and is flagged', () => {
    const [m] = majority([vote(['main']), vote(['main']), vote(['s1']), vote(['s1'])], 1);
    assert.deepEqual([m.issue, m.tie], [[], true]);
  });

  it('credits each id a strict majority names, however the votes split across id sets', () => {
    const set = (...ids) => [{ issue: ids, outside: null, reason: 'r' }];
    const [a, b, c] = [
      majority([set('main'), set('main'), set('main', 's2'), set('main', 's2'), set('main', 's2')], 1)[0],
      majority([set('main'), set('main'), set('main', 's2'), set('main', 's2'), set('main', 's2', 's3')], 1)[0],
      majority([set('main', 's2'), set('main', 's2'), set('main'), set('s2'), set()], 1)[0],
    ];
    assert.deepEqual(a.issue, ['main', 's2']);
    assert.deepEqual(b.issue, ['main', 's2']);
    assert.deepEqual(c.issue, ['main', 's2']);
    const [none] = majority([set('main'), set('main'), set('s2'), set('s2'), set('s3')], 1);
    assert.deepEqual([none.issue, none.tie], [[], true]);
  });

  it('an outside kind needs a strict majority of all valid votes', () => {
    const out = (outside) => [{ issue: [], outside, reason: 'r' }];
    assert.equal(majority([out('real'), out('real'), out('real'), out('arguable'), out('arguable')], 1)[0].outside, 'real');
    const [split] = majority([out('real'), out('real'), out('arguable'), out('arguable'), out(null)], 1);
    assert.deepEqual([split.outside, split.tie], [null, true]);
  });

  it('with no valid vote a finding is unclassified, not credited', () => {
    const [m] = majority([null, null], 1);
    assert.deepEqual([m.issue, m.outside, m.votes], [[], null, 0]);
  });
});

describe('matchFindings', () => {
  it('asks once per vote with the diff, the issues and the numbered findings, and makes no call without findings', () => {
    const run = scripted(verdict([1, 'main'], [2, null, 'false']));
    const { matched, votes } = matchFindings({ diff: 'THE DIFF', issues, findings: ['f one', 'f two'], run, votes: 3 });
    assert.equal(run.prompts.length, 3);
    assert.match(run.prompts[0], /THE DIFF[\s\S]*- main \[team-rule\] deep import[\s\S]*Declared to overlap with: main[\s\S]*1\. f one\n2\. f two/);
    assert.equal(votes.length, 3);
    assert.deepEqual(matched.map((m) => [m.finding, m.issue, m.outside]), [['f one', ['main'], null], ['f two', [], 'false']]);
    assert.deepEqual(matchFindings({ diff: '', issues, findings: [], run, votes: 3 }), { matched: [], votes: [] });
    assert.equal(run.prompts.length, 3);
  });

  it('a control has no known issues and the prompt says so', () => {
    assert.match(matchPrompt({ diff: 'd', issues: [], findings: ['x'] }), /\(none: the change is sound\)/);
  });
});

describe('metrics', () => {
  const matched = [{ issue: ['main'], outside: null }, { issue: [], outside: 'real' }, { issue: [], outside: 'arguable' }, { issue: [], outside: 'false' }, { issue: [], outside: null }, { issue: ['main'], outside: null }];
  it('count an issue once however many findings credit it, and the outside kinds apart', () => {
    const m = runMetrics(issues, matched);
    assert.deepEqual([m.findings, m.foundIds, m.recallMain, m.recallAll, m.outsideReal, m.arguable, m.falseFindings, m.unclassified], [6, ['main'], 1, 1 / 3, 1, 1, 1, 1]);
    assert.deepEqual(m.byCategory, { 'team-rule': { found: 1, total: 1 }, tests: { found: 0, total: 2 } });
  });

  it('a control has no recall, only false findings', () => {
    const m = runMetrics([], [{ issue: [], outside: 'false' }]);
    assert.deepEqual([m.recallMain, m.recallAll, m.falseFindings], [null, null, 1]);
  });

  it('aggregate averages per arm and case and sums per arm and category', () => {
    const run = (arm, found) => ({ arm, case: 'c', metrics: runMetrics(issues, found.map((id) => ({ issue: [id], outside: null }))) });
    const { perCase, perCategory } = aggregate([run('plugin', ['main']), run('plugin', ['main', 's1']), run('bare', [])]);
    assert.deepEqual(perCase.map((c) => [c.key, c.runs, c.recallMain, c.recallAll]), [['plugin/c', 2, 1, 0.5], ['bare/c', 1, 0, 0]]);
    assert.deepEqual(perCategory.find((c) => c.key === 'plugin/tests'), { key: 'plugin/tests', found: 1, total: 4, recall: 0.25 });
  });

  it('the table names each regex and matcher disagreement', () => {
    const runs = [{ arm: 'bare', case: 'c', n: 1, comparison: [{ id: 's1', regex: true, matcher: false }, { id: 'main', regex: true, matcher: true }], metrics: runMetrics(issues, []) }];
    const text = markdown({ model: 'm', runs, summary: aggregate(runs), cost: { calls: 2, usd: 0.5 } });
    assert.match(text, /1 disagreement/);
    assert.match(text, /bare\/c-1 s1: regex found, matcher missed/);
  });
});

describe('the judge budget', () => {
  it('counts calls and cost, and refuses a call once the budget is spent', () => {
    const run = budgeted(() => ({ text: '', costUsd: 0.6 }), 1);
    run('a');
    run('b');
    assert.throws(() => run('c'), /budget of \$1 reached after 2 calls/);
    assert.deepEqual(run.cost, { calls: 2, usd: 1.2 });
  });
});

describe('run directories', () => {
  it('are found from a run dir, an arm/stamp dir or a bare stamp', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'regrade-dirs-'));
    const one = path.join(root, 'plugin', 'S1', 'review-x-1');
    mkdirSync(one, { recursive: true });
    writeFileSync(path.join(one, 'meta.json'), '{}');
    assert.deepEqual(runDirs([one], root), [one]);
    assert.deepEqual(runDirs([path.join(root, 'plugin', 'S1')], root), [one]);
    assert.deepEqual(runDirs(['S1'], root), [one]);
    assert.deepEqual(runDirs(['S9'], root), []);
  });
});

describe('validate', () => {
  it('scores a finding as agreeing when its credit is one of the accepted ids, and reports every miss with the votes', () => {
    const labels = [
      { case: 'c', text: 'right', accept: ['main'] },
      { case: 'c', text: 'wrong', accept: ['s1'] },
      { case: 'c', text: 'none', accept: [null] },
    ];
    const run = scripted(verdict([1, 'main'], [2, 'main'], [3, null, 'real']));
    const out = validate({ labels, run, votes: 2, diffOf: () => 'd', truthOf: () => issues });
    assert.equal(out.total, 3);
    assert.ok(Math.abs(out.agreement - 2 / 3) < 1e-9);
    assert.deepEqual(out.misses.map((m) => [m.text, m.got]), [['wrong', 'main']]);
    assert.equal(out.misses[0].reasons.length, 2);
    assert.equal(run.prompts.length, 2);
  });
});

describe('the labelled set', () => {
  it('names a case of the matrix for every probe, an optional id as id-or-none, and adds one paraphrase per truth issue', () => {
    const set = labelledSet([['review-ts-boundary', issues]]);
    assert.equal(set.length, PROBE_LABELS.length + issues.length);
    assert.ok(PROBE_LABELS.every(([name]) => /^review-(ts|py|go|jvm|mono)-/.test(name)));
    assert.deepEqual(set.find((l) => l.text.includes('year 2999')).accept, ['main', null]);
    assert.deepEqual(set.find((l) => l.text.startsWith('src/b.ts:1 other')).accept, ['s2']);
    assert.ok(set.filter((l) => l.accept.length === 1 && l.accept[0] === null).length >= 8, 'probes that report no known issue');
  });
});
