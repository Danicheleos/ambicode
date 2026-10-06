import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { acCoverage, fileRecall, scoredPlan, scorePlanRun } from './plan-score.mjs';

let repo;
before(async () => {
  repo = await mkdtemp(path.join(tmpdir(), 'plan-score-'));
  await mkdir(path.join(repo, 'src'), { recursive: true });
  for (const file of ['src/a.ts', 'src/b.ts', 'src/a.spec.ts']) await writeFile(path.join(repo, file), '');
});
after(() => rm(repo, { recursive: true, force: true }));

const TRUTH = 'M\tsrc/a.ts\nM\tsrc/b.ts\nM\tsrc/a.spec.ts\nA\tsrc/new.ts\nM\tsrc/gone.ts\n';
const PLAN = 'Change `src/a.ts:10` and src/new.ts; AC1 and AC3 are handled.\n';
const LABELS = { epic1: { acs: [{ id: 'AC1' }, { id: 'AC2' }, { id: 'AC3' }, { id: 'AC4' }] } };

describe('plan score', () => {
  it('06-E4: file recall counts existing non-test touched files only', () => {
    assert.deepEqual(fileRecall(PLAN, TRUTH, repo), { recall: 0.5, hit: 1, total: 2 });
  });
  it('06-E4: scores a run through an injected checker', () => {
    const fake = { anchors: { checked: 4, bad: [], badTotal: 1 } };
    const trace = JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 10, cache_read_input_tokens: 90 }, content: [] } });
    const ledger = '{"kind":"revise"}\n{"kind":"route"}\n{"kind":"revise"}\n';
    const calls = [];
    const score = scorePlanRun(
      { text: PLAN, kind: 'draft', epic: 'epic1', task: 'slug', repo, truth: TRUTH, labels: LABELS, cost: 1.5, turns: 12, trace, ledger },
      { check: (input) => (calls.push(input.task), fake) },
    );
    assert.deepEqual(calls, ['slug']);
    assert.equal(score.anchorValidity, 0.75);
    assert.equal(score.acCoverage, 0.5);
    assert.equal(score.fileRecall, 0.5);
    assert.deepEqual([score.cost, score.turns, score.peakContext, score.revises, score.scoredText], [1.5, 12, 100, 2, 'draft']);
  });
  it('06-E4: anchor validity is null when nothing was checked', () => {
    const score = scorePlanRun({ text: PLAN, epic: 'epic1', task: 's', repo, truth: TRUTH, labels: LABELS }, { check: () => ({ anchors: { checked: 0, badTotal: 0 } }) });
    assert.equal(score.anchorValidity, null);
    assert.equal(score.revises, null);
  });
  it('06-E4: prefers the promoted plan over the latest draft', async () => {
    const directory = path.join(repo, 'task');
    await mkdir(directory);
    await writeFile(path.join(directory, 'plan-draft_2026-10-06T10-00.md'), 'draft');
    assert.equal(scoredPlan(directory).kind, 'draft');
    await writeFile(path.join(directory, 'plan_2026-10-06T10-05.md'), 'promoted');
    assert.deepEqual(scoredPlan(directory), { text: 'promoted', kind: 'promoted', name: 'plan_2026-10-06T10-05.md' });
  });
  it('06-E4: the latest draft is ordered by minute, then by the numeric collision suffix', async () => {
    const directory = path.join(repo, 'drafts');
    await mkdir(directory);
    const names = ['plan-draft_2026-10-06T09-59.md', 'plan-draft_2026-10-06T10-00.md', 'plan-draft_2026-10-06T10-00-2.md', 'plan-draft_2026-10-06T10-00-10.md', 'plan-draft_2026-10-06T10-00-9.md'];
    for (const name of names) await writeFile(path.join(directory, name), name);
    assert.equal(scoredPlan(directory).name, 'plan-draft_2026-10-06T10-00-10.md');
    await rm(path.join(directory, 'plan-draft_2026-10-06T10-00-10.md'));
    await rm(path.join(directory, 'plan-draft_2026-10-06T10-00-9.md'));
    assert.equal(scoredPlan(directory).name, 'plan-draft_2026-10-06T10-00-2.md');
  });
  it('06-E4: an AC the plan excludes under Not covered is not coverage', () => {
    const labels = { e: { acs: [{ id: 'AC-1' }, { id: 'AC-2' }] } };
    assert.deepEqual(acCoverage('## Not covered\nAC-1: deferred to a later project.\n', labels, 'e'), { coverage: 0, covered: 0, total: 2 });
    assert.deepEqual(acCoverage('| AC-1 | Iteration 1 |\n| AC-2 | Iteration 2 |\n', labels, 'e'), { coverage: 1, covered: 2, total: 2 });
    const mixed = '| AC-1 | Iteration 1 |\n| AC-2 | Not covered |\n\n## Not covered\n### AC-2\nlater.\n\n## Iteration 1\nAC-1 lands here.\n';
    assert.deepEqual(acCoverage(mixed, labels, 'e'), { coverage: 0.5, covered: 1, total: 2 });
  });
});
