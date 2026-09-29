#!/usr/bin/env node
// Adds the T2review block to baseline/metrics-R-1.json from files, not typed numbers:
// scratch/t2review-merge.out (t2-merge.mjs on the single review-only result), scratch/trace-summary.json
// and scratch/t2review-sonnet.json. T2 and every other key stay untouched; the script refuses to run
// if T2review already exists or if T2 changed.
import { readFileSync, writeFileSync } from 'node:fs';

const here = new URL('.', import.meta.url).pathname;
const metricsFile = new URL('../baseline/metrics-R-1.json', import.meta.url).pathname;
const merge = JSON.parse(readFileSync(`${here}scratch/t2review-merge.out`, 'utf8'));
const traces = JSON.parse(readFileSync(`${here}scratch/trace-summary.json`, 'utf8'));
const sweep = JSON.parse(readFileSync(`${here}scratch/t2review-sonnet.json`, 'utf8'));
const r4 = (n) => Math.round(n * 1e4) / 1e4;
const idx = merge.perRunIndex;
const arms = merge.arms;
const sweeps = (key) => idx[key].sweeps.map((s) => r4(s.recall));
const helperTotal = (key) => idx[key].sweeps.reduce((n, s) => n + s.helperRan, 0);

const modelRows = {};
for (const g of Object.values(traces.groups)) for (const [name, n] of Object.entries(g.models)) modelRows[name] = (modelRows[name] ?? 0) + n;
const initRows = Object.values(modelRows).reduce((a, b) => a + b, 0);
if (Object.keys(modelRows).length !== 1 || !modelRows['claude-sonnet-5-5']) throw new Error(`agent model is not one Sonnet: ${JSON.stringify(modelRows)}`);
if (merge.cases !== 8 || merge.partial !== false || merge.missing.length !== 0) throw new Error('result does not name 8 complete cases');

const m = JSON.parse(readFileSync(metricsFile, 'utf8'));
if (m.T2review) throw new Error('T2review already exists');
const t2Before = JSON.stringify(m.T2);
m.T2review = {
  runsPerArm: 3,
  cases: merge.cases,
  partial: merge.partial,
  iteration: 'it-013',
  promptSentence: 'Use the ambicode review skill to review the change before it merges: report the problems a reviewer should raise, each with its file and line. (both arms read it)',
  assembled: 'one uninterrupted invocation, no reruns, no merge: t2-merge.mjs was run on the single result only to print per-run-index medians',
  resultFiles: ['evals/evals-core/results/eval-2026-09-29T13-42-27-702Z.json'],
  copiedTo: 'gym/runs/R1/it-013/scratch/t2review-sonnet.json',
  claudeVersion: sweep.claudeVersion,
  modelOverride: sweep.suite.modelOverride,
  agentModelProof: `${modelRows['claude-sonnet-5-5']} of ${initRows} system/init rows in the ${Object.values(traces.groups).reduce((n, g) => n + g.traces, 0)} traces this result names are claude-sonnet-5-5 (it-010/trace-summary.mjs; missingTraces ${traces.missingTraces})`,
  exitStatus: 'claude plugin eval exited 1 with threshold 1 (some case scored below it), as at cp-S0; the result has partial false and 0 run errors',
  review: {
    with: {
      recallMedian: r4(idx['review/with'].median),
      recallSweeps: sweeps('review/with'),
      recallPooled: r4(arms['review/with'].recall),
      helperRan: helperTotal('review/with'),
      helperRanOf: 24,
      helperRanMedian: idx['review/with'].helperRanMedian,
      helperRanMedianOf: 8,
      pluginFired: arms['review/with']['plugin-fired'],
      skillCalls: traces.groups['review/with'].skills,
      costUsdPerRun: r4(arms['review/with'].costUsd),
      turns: r4(arms['review/with'].turns),
    },
    without: {
      recallMedian: r4(idx['review/without'].median),
      recallSweeps: sweeps('review/without'),
      recallPooled: r4(arms['review/without'].recall),
      costUsdPerRun: r4(arms['review/without'].costUsd),
      turns: r4(arms['review/without'].turns),
      skillCalls: traces.groups['review/without'].skills,
      skillCallRuns: traces.groups['review/without'].skillRuns,
      note: 'the without arm has no plugin; the prompt names a skill it cannot call, and it tried in skillCallRuns of 24 runs',
    },
  },
  runErrors: 0,
  costUsd: r4(merge.costUsd),
  seconds: merge.durationSeconds,
  reference: 'T2.review of this file (cp-S0, old prompt sentence): with recall median 0.0938, helper-ran 0 of 24; without 0.0938',
};
if (JSON.stringify(m.T2) !== t2Before) throw new Error('T2 changed');
writeFileSync(metricsFile, `${JSON.stringify(m, null, 2)}\n`);
console.log(JSON.stringify(m.T2review, null, 2));
