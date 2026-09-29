// The recorder spawns the reviewer and costs money, so only its pure parts are tested here.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertFreshKeepDirectory, buildSummary, buildUsage, chooseRecording, keepRunsDirectory, parseOptions, stability } from './evals-record-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const finding = (risk, newPath, oldPath = null) => ({ risk, location: { oldPath, newPath, side: 'new', line: 1 } });
const good = (run, findings, usage = null, recording = { run }) => ({ run, ok: true, findings, usage, recording });
const bad = (run, detail = 'reviewer failed: x') => ({ run, ok: false, detail });

describe('evals-record-core: options', () => {
  it('keeps today’s defaults and leaves case names and the flag values apart', () => {
    assert.deepEqual(parseOptions([]), { concurrency: 2, excludes: [], runs: 1, keepRuns: null, only: [] });
    assert.deepEqual(parseOptions(['be-a', '-j', '4', '--exclude', '*.lock', 'fe-b', '--exclude', 'dist/**']), {
      concurrency: 4,
      excludes: ['*.lock', 'dist/**'],
      runs: 1,
      keepRuns: null,
      only: ['be-a', 'fe-b'],
    });
  });

  it('reads --runs and --keep-runs without treating their values as case names', () => {
    const options = parseOptions(['--runs', '3', 'be-a', '--keep-runs', 'x/scratch/keep', '-j', '6']);
    assert.deepEqual(options, { concurrency: 6, excludes: [], runs: 3, keepRuns: 'x/scratch/keep', only: ['be-a'] });
  });

  it('refuses a --runs that is not a positive integer and a flag with no value', () => {
    for (const bogus of ['0', '-1', '2.5', 'two', '']) assert.throws(() => parseOptions(['--runs', bogus]), /--runs needs a positive integer/);
    assert.throws(() => parseOptions(['--runs']), /--runs needs a value/);
    assert.throws(() => parseOptions(['be-a', '--keep-runs']), /--keep-runs needs a value/);
  });
});

describe('evals-record-core: --keep-runs directory', () => {
  const ignored = () => true;

  it('accepts a path with a scratch segment that git ignores, resolved from the working directory', () => {
    assert.equal(keepRunsDirectory('gym/runs/R1/it-005/scratch/keep', ignored), path.resolve('gym/runs/R1/it-005/scratch/keep'));
    assert.equal(keepRunsDirectory(path.join(path.sep, 'tmp', 'scratch'), ignored), path.join(path.sep, 'tmp', 'scratch'));
  });

  it('refuses one outside scratch, including a lookalike segment and a `..` that leaves it', () => {
    for (const outside of ['gym/runs/R1/it-005/keep', 'benchmarks', 'scratchpad/keep', 'my-scratch', 'scratch/../keep']) {
      assert.throws(() => keepRunsDirectory(outside, ignored), /refused, no path segment is "scratch"/, outside);
    }
  });

  it('refuses a scratch path when git does not ignore a file inside it, and asks about that file', () => {
    const asked = [];
    assert.throws(
      () => keepRunsDirectory('evals/scratch/keep', (file) => (asked.push(file), false)),
      /refused, git does not ignore it/,
    );
    assert.deepEqual(asked, [path.resolve('evals/scratch/keep', 'x')]);
  });

  it('asks the real git: the gym scratch tree is ignored, evals/scratch is not', () => {
    const ignoredDirectory = path.join(ROOT, 'gym', 'runs', 'R1', 'it-005', 'scratch', 'keep');
    assert.equal(keepRunsDirectory(ignoredDirectory), ignoredDirectory);
    assert.throws(() => keepRunsDirectory(path.join(ROOT, 'evals', 'scratch', 'keep')), /git does not ignore it/);
    assert.throws(() => keepRunsDirectory(path.join(ROOT, 'src', 'scratch')), /git does not ignore it/);
  });
});

describe('evals-record-core: reusing a --keep-runs directory', () => {
  it('passes for a missing or run-files-only directory and refuses once summary.json or usage.json exists', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'record-core-keep-'));
    try {
      assert.doesNotThrow(() => assertFreshKeepDirectory(path.join(directory, 'missing')));
      writeFileSync(path.join(directory, 'run-1.json'), '{}');
      assert.doesNotThrow(() => assertFreshKeepDirectory(directory));
      for (const sidecar of ['summary.json', 'usage.json']) {
        writeFileSync(path.join(directory, sidecar), '{}');
        assert.throws(() => assertFreshKeepDirectory(directory), new RegExp(`${sidecar}.*use a new directory`), sidecar);
        rmSync(path.join(directory, sidecar));
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('evals-record-core: stability', () => {
  it('is null when no run has a medium or high finding', () => {
    assert.equal(stability([]), null);
    assert.equal(stability([[], []]), null);
    assert.equal(stability([[finding('low', 'a.ts')], [finding('low', 'a.ts')], []]), null);
  });

  it('counts a path seen in one of three runs as unstable', () => {
    assert.equal(stability([[finding('high', 'a.ts')], [], []]), 0);
  });

  it('is the share of distinct paths present in at least two runs', () => {
    const runs = [
      [finding('high', 'a.ts'), finding('medium', 'b.ts')],
      [finding('medium', 'a.ts'), finding('high', 'c.ts')],
      [finding('high', 'a.ts'), finding('medium', 'd.ts')],
    ];
    assert.equal(stability(runs), 1 / 4);
  });

  it('works for k = 2 and is 1 when every path recurs', () => {
    assert.equal(stability([[finding('high', 'a.ts'), finding('medium', 'b.ts')], [finding('medium', 'b.ts'), finding('high', 'a.ts')]]), 1);
    assert.equal(stability([[finding('high', 'a.ts'), finding('high', 'b.ts')], [finding('high', 'a.ts')]]), 1 / 2);
  });

  it('ignores low findings, keys a deleted file by its old path, and counts a path once per run', () => {
    const runs = [
      [finding('medium', null, 'gone.ts'), finding('high', null, 'gone.ts'), finding('low', 'noise.ts')],
      [finding('high', null, 'gone.ts')],
    ];
    assert.equal(stability(runs), 1);
  });
});

describe('evals-record-core: which run goes to the recordings file', () => {
  it('takes the highest successful run index whatever the completion order', () => {
    const runs = [good(2, [], null, { run: 2 }), good(3, [], null, { run: 3 }), good(1, [], null, { run: 1 })];
    assert.deepEqual(chooseRecording(runs), { run: 3 });
    assert.deepEqual(chooseRecording([...runs].reverse()), { run: 3 });
  });

  it('skips a failed higher run, and is null when no run succeeded', () => {
    assert.deepEqual(chooseRecording([good(1, [], null, { run: 1 }), good(2, [], null, { run: 2 }), bad(3)]), { run: 2 });
    assert.equal(chooseRecording([bad(1), bad(2)]), null);
  });
});

describe('evals-record-core: summary and usage', () => {
  const cases = [
    {
      case: 'be-a',
      runs: [
        good(2, [finding('high', 'a.ts'), finding('low', 'b.ts')], { turns: 4, apiDurationMs: 9000, outputTokens: 700, costUsd: 0.25 }),
        good(1, [finding('medium', 'a.ts'), finding('high', 'c.ts')], { turns: 3, apiDurationMs: null, outputTokens: 500, costUsd: 0.2 }),
        bad(3),
      ],
    },
    { case: 'fe-b', runs: [bad(1, 'reviewer failed: timeout'), bad(2, 'snapshot ids differ')] },
    { case: 'be-c', runs: [good(1, [finding('low', 'a.ts')])] },
  ];

  it('reports per case the successful runs, both counts and the stability', () => {
    const summary = buildSummary(cases);
    assert.deepEqual(summary.cases.map((c) => [c.case, c.k, c.runs, c.counts, c.mediumPlusCounts, c.stability]), [
      ['be-a', 2, [1, 2], [2, 2], [2, 1], 1 / 2],
      ['be-c', 1, [1], [1], [0], null],
    ]);
    assert.deepEqual(summary.cases[0].failedRuns, [{ run: 3, detail: 'reviewer failed: x' }]);
  });

  it('leaves stability null, not 0, when fewer than two runs succeeded', () => {
    const summary = buildSummary([{ case: 'be-a', runs: [good(1, [finding('high', 'a.ts')]), bad(2)] }]);
    assert.deepEqual(summary.cases.map((c) => [c.k, c.mediumPlusCounts, c.stability]), [[1, [1], null]]);
  });

  it('lists a case with no successful run as refused, not as an empty result', () => {
    assert.deepEqual(buildSummary(cases).refused, [
      {
        case: 'fe-b',
        failedRuns: [
          { run: 1, detail: 'reviewer failed: timeout' },
          { run: 2, detail: 'snapshot ids differ' },
        ],
      },
    ]);
  });

  it('writes usage per run with null, never 0, for what the envelope lacked, and nothing for a failed run', () => {
    const usage = buildUsage(cases);
    assert.deepEqual(usage.cases[0].runs, [
      { run: 1, turns: 3, apiDurationMs: null, outputTokens: 500, costUsd: 0.2 },
      { run: 2, turns: 4, apiDurationMs: 9000, outputTokens: 700, costUsd: 0.25 },
    ]);
    assert.deepEqual(usage.cases[1].runs, []);
    assert.deepEqual(usage.cases[2].runs, [{ run: 1, turns: null, apiDurationMs: null, outputTokens: null, costUsd: null }]);
  });
});
