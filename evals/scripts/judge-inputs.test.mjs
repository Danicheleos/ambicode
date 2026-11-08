import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { baseName, formatJudge, formatMaster, formatRun, judgeInputs } from './judge-inputs.mjs';

const SHA = 'a'.repeat(40);
const put = (root, rel, text = '') => { mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); writeFileSync(path.join(root, rel), text); };

function fixture() {
  // The S1 prefix keeps the arm-leak check honest: a random 6-char suffix held S1 on 2026-11-08.
  const root = mkdtempSync(path.join(tmpdir(), 'judge-inputs-S1-'));
  put(root, 'evals/local/real-cases.suite.json', JSON.stringify({ cases: [{ name: 'task-x', promptFile: 'suite-real-tickets/X-1.md', parent: 'f'.repeat(40) }] }));
  put(root, 'evals/local/suite-real-tickets/X-1.md', 'ticket');
  put(root, 'evals/local/suite-real-material/task-x/.ambicode/policies/p.yaml');
  put(root, 'evals/bare/task-chain/01-task-x-chain/scaffold.sh', `git -C '/bench/x' archive --format=tar ${SHA} | tar xf -\n`);
  put(root, 'evals/cases/results/bare/S1/aggregate-result.json', JSON.stringify({ cases: [{ name: 'task-x-chain', dir: 'evals/bare/task-chain/01-task-x-chain', arms: { with: [{ costUsd: 0.5, durationSeconds: 60 }, { costUsd: 0.7, durationSeconds: 80 }] } }] }));
  put(root, 'evals/cases/task-chain/01-task-x-chain-plan/scaffold.sh', `git -C '/bench/x' archive --format=tar ${SHA} | tar xf -\n`);
  put(root, 'evals/cases/results/S2/aggregate-result.json', JSON.stringify({ cases: [{ name: 'task-x-chain', dir: 'evals/cases/task-chain/01-task-x-chain', arms: { with: [{ costUsd: 1, durationSeconds: 90 }] } }] }));
  for (const [arm, stamp, n] of [['bare', 'S1', 1], ['bare', 'S1', 2], ['plugin', 'S2', 1]]) put(root, `evals/cases/results/traces/${arm}/${stamp}/task-x-chain-${n}.diff`, 'diff');
  return root;
}

describe('judge-inputs', () => {
  it('strips the stage suffix to find the suite-real case', () => {
    assert.deepEqual(['a-chain', 'a-chain-plan', 'a-plan', 'a'].map(baseName), ['a', 'a', 'a', 'a']);
  });

  it('lists one row per run with ticket, diff, base, policies, cost and duration, all existing', () => {
    const root = fixture();
    try {
      const rows = judgeInputs({ stamp: 'S1', root });
      assert.equal(rows.length, 2);
      assert.deepEqual(rows.map((r) => [r.arm, r.run, r.costUsd, r.durationSeconds, r.base, r.checkout]), [['bare', 1, 0.5, 60, SHA, '/bench/x'], ['bare', 2, 0.7, 80, SHA, '/bench/x']]);
      assert.equal(rows[1].diff, path.join(root, 'evals/cases/results/traces/bare/S1/task-x-chain-2.diff'));
      assert.equal(rows[0].ticket, path.join(root, 'evals/local/suite-real-tickets/X-1.md'));
      assert.equal(rows[0].policies, path.join(root, 'evals/local/suite-real-material/task-x/.ambicode/policies'));
      assert.doesNotMatch(rows.map(formatRun).join('\n'), /MISSING/);
      assert.ok(rows.every((r) => existsSync(r.judgeDiff)));
      const plugin = judgeInputs({ stamp: 'S2', root })[0];
      assert.deepEqual([plugin.arm, plugin.base, plugin.checkout], ['plugin', SHA, '/bench/x']); // dir holds only the -plan scaffold
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('hands the judge an arm-neutral copy of the diff and keeps arm, cost and original path master-only', () => {
    const root = fixture();
    // S1 in the parent of the judge dir (judge-inputs.mjs makes ji-XXXXXX under it) keeps the diff arm-leak check honest.
    const tmp = mkdtempSync(path.join(tmpdir(), 'ji-S1-'));
    try {
      for (const stamp of ['S1', 'S2']) {
        const [row] = judgeInputs({ stamp, root, tmp });
        assert.equal(readFileSync(row.judgeDiff, 'utf8'), 'diff');
        assert.doesNotMatch(row.judgeDiff.split(path.dirname(row.judgeDiff)).join('<root>'), /plugin|bare|S1|S2|task-x|chain/);
        const judge = formatJudge(row);
        assert.doesNotMatch(judge.split(root).join('<root>').split(path.dirname(row.judgeDiff)).join('<root>'), /plugin|bare|S1|S2|chain|\$|duration/);
        assert.match(judge, new RegExp(row.judgeDiff));
        assert.match(formatMaster(row), /master-only.*arm (plugin|bare)/s);
        assert.match(formatMaster(row), /traces\/(plugin|bare)\//);
      }
    } finally { rmSync(root, { recursive: true, force: true }); rmSync(tmp, { recursive: true, force: true }); }
  });

  it('prints the incoming plan of a plugin chain code stage on a master-only line', () => {
    const root = fixture();
    const archive = path.join(root, 'arch');
    try {
      put(root, 'arch/task-x-chain-1.ambicode/.ambicode/tasks/t1/plan.md', 'plan');
      const [row] = judgeInputs({ stamp: 'S2', root, archive });
      assert.equal(row.plan, path.join(archive, 'task-x-chain-1.ambicode/.ambicode/tasks/t1/plan.md'));
      assert.match(formatMaster(row), /plan: .*plan\.md/);
      assert.doesNotMatch(formatJudge(row), /plan/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('rejects a bad arm, an arm that does not hold the stamp and an unknown stamp with a clear message', () => {
    const root = fixture();
    try {
      assert.throws(() => judgeInputs({ stamp: 'S1', arm: 'foo', root }), /--arm must be plugin or bare/);
      assert.throws(() => judgeInputs({ stamp: 'S2', arm: 'bare', root }), /no bare aggregate-result\.json for stamp S2/);
      assert.throws(() => judgeInputs({ stamp: 'nope', root }), /no aggregate-result\.json for stamp nope/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('marks an unresolved ticket or policy dir MISSING and a base taken from the suite parent', () => {
    const root = fixture();
    try {
      put(root, 'evals/cases/results/bare/S3/aggregate-result.json', JSON.stringify({ cases: [{ name: 'task-unknown-chain', dir: 'evals/bare/none', arms: { with: [{ costUsd: 1, durationSeconds: 1 }] } }] }));
      put(root, 'evals/cases/results/bare/S4/aggregate-result.json', JSON.stringify({ cases: [{ name: 'task-x-chain', dir: 'evals/bare/none', arms: { with: [{ costUsd: 1, durationSeconds: 1 }] } }] }));
      const unknown = formatJudge(judgeInputs({ stamp: 'S3', root })[0]);
      assert.match(unknown, /ticket: .*MISSING/);
      assert.match(unknown, /policies: .*MISSING/);
      assert.match(formatJudge(judgeInputs({ stamp: 'S4', root })[0]), /base: +f{40} \(fallback: suite parent, verify\)/);
      assert.doesNotMatch(formatJudge(judgeInputs({ stamp: 'S1', root })[0]), /fallback/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('marks a missing diff and rejects an unknown stamp', () => {
    const root = fixture();
    try {
      rmSync(path.join(root, 'evals/cases/results/traces/plugin/S2/task-x-chain-1.diff'));
      assert.match(formatJudge(judgeInputs({ stamp: 'S2', root })[0]), /diff: .*MISSING/);
      assert.throws(() => judgeInputs({ stamp: 'nope', root }), /no aggregate-result.json/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
