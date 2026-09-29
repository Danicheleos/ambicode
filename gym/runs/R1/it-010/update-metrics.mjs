#!/usr/bin/env node
// Writes the T2 block of baseline/metrics-R-1.json from files, not from typed numbers:
// scratch/t2-merge.out (t2-merge.mjs on the complete sweep) and scratch/trace-summary.json.
// Shape follows baseline/metrics.json T2 so the two references can be compared field by field.
import { readFileSync, writeFileSync } from 'node:fs';

const here = new URL('.', import.meta.url).pathname;
const metricsFile = new URL('../baseline/metrics-R-1.json', import.meta.url).pathname;
const merge = JSON.parse(readFileSync(`${here}scratch/t2-merge.out`, 'utf8'));
const traces = JSON.parse(readFileSync(`${here}scratch/trace-summary.json`, 'utf8'));
const sweep = JSON.parse(readFileSync(`${here}scratch/t2-sonnet.json`, 'utf8'));
const r4 = (n) => Math.round(n * 1e4) / 1e4;
const idx = merge.perRunIndex;
const arms = merge.arms;
const sweeps = (key, metric) => idx[key].sweeps.map((s) => r4(s[metric]));
const helperTotal = (key) => idx[key].sweeps.reduce((n, s) => n + s.helperRan, 0);

const modelRows = {};
for (const g of Object.values(traces.groups)) for (const [name, n] of Object.entries(g.models)) modelRows[name] = (modelRows[name] ?? 0) + n;
const initRows = Object.values(modelRows).reduce((a, b) => a + b, 0);
if (Object.keys(modelRows).length !== 1 || !modelRows['claude-sonnet-5-5']) throw new Error(`agent model is not one Sonnet: ${JSON.stringify(modelRows)}`);

const m = JSON.parse(readFileSync(metricsFile, 'utf8'));
m.T2 = {
  runsPerArm: 3,
  cases: merge.cases,
  partial: merge.partial,
  assembled: 'one uninterrupted invocation, no reruns, no merge: t2-merge.mjs was run on the single result only to print per-run-index medians',
  resultFiles: ['evals/evals-core/results/eval-2026-09-29T12-17-46-139Z.json'],
  copiedTo: 'gym/runs/R1/it-010/scratch/t2-sonnet.json',
  claudeVersion: sweep.claudeVersion,
  modelOverride: sweep.suite.modelOverride,
  agentModelProof: `${modelRows['claude-sonnet-5-5']} of ${initRows} system/init rows in the ${Object.values(traces.groups).reduce((n, g) => n + g.traces, 0)} traces this result names are claude-sonnet-5-5 (it-010/trace-summary.mjs; missingTraces ${traces.missingTraces})`,
  exitStatus: 'claude plugin eval exited 1 with threshold 1 (some case scored below it); the baseline sweeps showed the same exit=1 on review cases. The result has partial false and 0 run errors.',
  localize: {
    with: {
      f1Median: r4(idx['localize/with'].median),
      f1Sweeps: sweeps('localize/with', 'f1'),
      f1Pooled: r4(arms['localize/with'].f1),
      precision: r4(arms['localize/with'].precision),
      recall: r4(arms['localize/with'].recall),
      helperRan: helperTotal('localize/with'),
      helperRanOf: 30,
      helperRanMedian: idx['localize/with'].helperRanMedian,
      helperRanMedianOf: 10,
      pluginFired: arms['localize/with']['plugin-fired'],
      skillCalls: traces.groups['localize/with'].skills,
      costUsdPerRun: r4(arms['localize/with'].costUsd),
      turns: r4(arms['localize/with'].turns),
    },
    without: {
      f1Median: r4(idx['localize/without'].median),
      f1Sweeps: sweeps('localize/without', 'f1'),
      f1Pooled: r4(arms['localize/without'].f1),
      precision: r4(arms['localize/without'].precision),
      recall: r4(arms['localize/without'].recall),
      costUsdPerRun: r4(arms['localize/without'].costUsd),
      turns: r4(arms['localize/without'].turns),
    },
  },
  review: {
    with: {
      recallMedian: r4(idx['review/with'].median),
      recallSweeps: sweeps('review/with', 'recall'),
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
      recallSweeps: sweeps('review/without', 'recall'),
      recallPooled: r4(arms['review/without'].recall),
      costUsdPerRun: r4(arms['review/without'].costUsd),
      turns: r4(arms['review/without'].turns),
    },
  },
  runErrors: 0,
  skippedPaidGraders: 0,
  costUsd: r4(merge.costUsd),
  seconds: merge.durationSeconds,
  opusReference: 'baseline/metrics.json T2 (history, not a control): $60.56 assembled ($57.83 for the one 3-run sweep of it-003), 3,202-3,232 s; localize with F1 0.6565, without 0.6198, helper-ran 28/30; review with recall 0.1563, without 0.1250, helper-ran 23/24',
};
delete m.T2Reason;
m.status = 'complete';
m.reference = 'R-1 Sonnet baseline (cp-S0 inputs complete)';
m.capturedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
m.commit = '8606622 (campaign files only since gym/R1/it-009; product surfaces byte-identical to gym/R1/it-003)';
writeFileSync(metricsFile, `${JSON.stringify(m, null, 2)}\n`);
console.log(JSON.stringify(m.T2, null, 2));
