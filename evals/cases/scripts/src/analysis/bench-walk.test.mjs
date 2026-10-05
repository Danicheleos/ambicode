// Regression assertions moved intact from the approved harness suite.
import { describe, before, after, it } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ticket, TRACE, event, toolUse, HELPER } from '../testing/bench-test-fixtures.mjs';
import { walkRuns, walkReport } from './bench-walk.mjs';
import assert from 'node:assert/strict';
import { servedPromptLine, NAKED_EQUIVALENCE } from '../harness/evals-bench.mjs';

describe('evals-bench: the walkthrough', () => {
  let benchmarks;
  before(() => {
    benchmarks = mkdtempSync(path.join(tmpdir(), 'bench-walk-'));
    mkdirSync(path.join(benchmarks, 'cases', 'side-t-1'), { recursive: true });
    writeFileSync(path.join(benchmarks, 'cases', 'side-t-1', 'truth.json'), JSON.stringify({ side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/a.ts', 'app/b.ts'] }));
    mkdirSync(path.join(benchmarks, 'traces'));
    writeFileSync(path.join(benchmarks, 'traces', 'e-walk.jsonl'), TRACE);
    const quiet = [event('system', { subtype: 'init', model: 'claude-sonnet-5-5' }), toolUse('Bash', { command: 'grep -rn total app' })].join('\n');
    writeFileSync(path.join(benchmarks, 'traces', 'e-quiet.jsonl'), quiet);
  });
  after(() => rmSync(benchmarks, { recursive: true, force: true }));

  const graders = [{ name: 'names-a-true-file', passed: true, evidence: '## Files\n- app/a.ts\n' }];
  const results = {
    suite: { modelOverride: 'claude-sonnet-5-5', plugins: [{ name: 'ambicode', path: '/some/variant' }] },
    cases: [
      {
        name: 'side-t-1',
        maxTurns: 40,
        arms: {
          with: [
            { graders, costUsd: 0.2, turns: 12, tracePath: '/private/tmp/e-walk/out/trace.jsonl' },
            { graders, costUsd: 0.1, turns: 40, tracePath: '/private/tmp/e-quiet/out/trace.jsonl' },
            { graders: [], costUsd: 0.1, turns: 3, error: 'timeout', tracePath: '/private/tmp/e-gone/out/trace.jsonl' },
          ],
        },
      },
    ],
  };

  it('names the first thing that went wrong in each run, in trace order', () => {
    const walk = walkRuns(results, { benchmarks, tracesDir: path.join(benchmarks, 'traces') });
    assert.deepEqual(
      walk.map((w) => w.deviations[0] ?? null),
      ['prepare output cut with head/tail/cut (step 2)', 'no AMBICODE skill fired', 'the run ended in an error: timeout'],
    );
    assert.deepEqual(walk[1].deviations, ['no AMBICODE skill fired', 'stopped at the 40-turn limit']);
    assert.ok(!walk[0].deviations.some((d) => d.startsWith('review re-run')), 'one review call is not a re-run');
    const rerun = [
      event('system', { subtype: 'init', model: 'claude-sonnet-5-5' }),
      toolUse('Skill', { skill: 'ambicode:review' }),
      toolUse('Bash', { command: `${HELPER} review --branch` }),
      toolUse('Bash', { command: `${HELPER} review --branch --exclude 'i18n/**'` }),
      toolUse('Edit', { file_path: '/s/repo/app/a.ts' }),
      toolUse('Read', { file_path: '/data/benchmarks/BE/assets/T-1.md' }),
    ].join('\n');
    writeFileSync(path.join(benchmarks, 'traces', 'e-rerun.jsonl'), rerun);
    const [again] = walkRuns({ cases: [{ name: 'side-t-1', arms: { with: [{ graders, tracePath: '/tmp/e-rerun/out/trace.jsonl' }] } }] }, { benchmarks, tracesDir: path.join(benchmarks, 'traces') });
    assert.deepEqual(again.deviations, [
      'review re-run (step 3)',
      'edit attempted: /s/repo/app/a.ts (step 4)',
      'reached into benchmarks/ (step 5)',
      'a skill fired but prepare never ran',
    ]);
    assert.equal(walk[0].steps[0], '1. Skill ambicode:investigate q');
    assert.ok(walk[0].steps.every((line) => line.length <= 120 && !line.includes('\n')));
    assert.equal(walk[2].steps, null, 'an untraced run has no steps, not an empty list');
  });

  it('names a helper call that failed, by the code it printed', () => {
    const call = (id, command) => event('assistant', { message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] } });
    const answer = (id, content, isError) => event('user', { message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] } });
    const failing = [
      event('system', { subtype: 'init', model: 'claude-sonnet-5-5' }),
      toolUse('Skill', { skill: 'ambicode:review' }),
      call('t1', `${HELPER} review`),
      answer('t1', 'Exit code 2\nerror [snapshot-too-large]: 15 changed files do not fit', true),
      call('t2', `${HELPER} review --exclude 'i18n/**'`),
      answer('t2', '1. WHAT WAS REVIEWED\n   review      local_x  (error: reviewer-error: Not logged in · Please run /login)', false),
      call('t3', 'grep -n x app/a.ts'),
      answer('t3', 'error [not-ours]: grep output is not a helper failure', false),
    ].join('\n');
    writeFileSync(path.join(benchmarks, 'traces', 'e-failing.jsonl'), failing);
    const [walk] = walkRuns({ cases: [{ name: 'side-t-1', arms: { with: [{ graders, tracePath: '/tmp/e-failing/out/trace.jsonl' }] } }] }, { benchmarks, tracesDir: path.join(benchmarks, 'traces') });
    assert.deepEqual(walk.deviations.slice(0, 3), ['review failed: snapshot-too-large (step 2)', 'review re-run (step 3)', 'review failed: reviewer-error (step 3)']);
  });

  it('writes one summary row per run, then each run with its steps', () => {
    const markdown = walkReport(results, { benchmarks, tracesDir: path.join(benchmarks, 'traces'), source: 'eval-x.json' });
    assert.match(markdown, /^# Walkthrough: eval-x\.json/m);
    assert.match(markdown, /Plugin \/some\/variant\b/);
    assert.match(markdown, /\| side-t-1 \| with \| 0 \| 0\.200 \| 12 \| ambicode:investigate \| 2 \(1 cut\) \| P 1\.00 R 0\.50 \| prepare output cut/);
    assert.match(markdown, /trace not harvested/);
    assert.match(markdown, /```\n1\. Skill ambicode:investigate q\n2\. Bash cd repo && node/);
  });
});

describe('evals-bench: reports name the served prompt', () => {
  it('says which prompt a run served, and that an older run did not record it', () => {
    assert.match(servedPromptLine({ suite: { servedPrompt: 'with' } }), /prompt\.with\.md/);
    assert.match(servedPromptLine({ suite: {} }), /unrecorded/);
    const markdown = walkReport({ claudeVersion: '2.1.289', suite: { servedPrompt: 'naked' }, cases: [] }, { source: 'x.json' });
    assert.match(markdown, /Claude Code 2\.1\.289/);
    assert.match(markdown, /Served prompt: naked \(prompt\.md\)/);
  });
});

describe('evals-bench: the walk names its baseline', () => {
  const base = { claudeVersion: '2.1.289', startedAt: '2026-10-06T00:00:00.000Z', suite: { servedPrompt: 'with' }, cases: [] };

  it('names a naked reference, its arm and version, and the equivalence it assumes', () => {
    const md = walkReport({ ...base, baseline: { file: 'base.json', arm: 'with', startedAt: '2026-10-04T00:00:00.000Z', plugin: 'naked', claudeVersion: '2.1.289' } }, { source: 'x.json' });
    assert.match(md, /Without arm: the with arm of cached baseline base\.json \(plugin naked, Claude Code 2\.1\.289\), started 2026-10-04T00:00:00\.000Z, 2\.0 days before this run\./);
    assert.ok(md.includes(`${NAKED_EQUIVALENCE[0].toUpperCase()}${NAKED_EQUIVALENCE.slice(1)}.`));
    assert.doesNotMatch(md, /none attached/);
  });

  it('names an ordinary historical reference without the naked caveat', () => {
    const md = walkReport({ ...base, baseline: { file: 'old.json', arm: 'without', startedAt: null, plugin: 'ambicode', claudeVersion: '2.1.285' } }, { source: 'x.json' });
    assert.match(md, /Without arm: the without arm of cached baseline old\.json \(plugin ambicode, Claude Code 2\.1\.285\), started at an unrecorded time/);
    assert.doesNotMatch(md, /equivalence unverified/);
  });

  it('says when no baseline is attached', () => {
    assert.match(walkReport(base, { source: 'x.json' }), /Baseline: none attached; this walk is not compared against a cached baseline\./);
  });
});
