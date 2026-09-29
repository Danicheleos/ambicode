#!/usr/bin/env node
// Usage: node screen-numbers.mjs <result.json>
// Scores a 1 run/arm screening with the bench's own score(); t2-merge.mjs cannot be used because it
// counts a case as complete only with 3 runs per arm (it dropped all 18 cases of this result).
import { readFileSync } from 'node:fs';
import { score } from '../../../../evals/scripts/src/evals-bench.mjs';

const result = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { runs, arms } = score(result);
const r4 = (n) => (n === null || n === undefined ? n : Math.round(n * 1e4) / 1e4);
const out = {};
for (const key of Object.keys(arms).filter((k) => k.split('/').length === 2)) {
  const a = arms[key];
  const [kind, arm] = key.split('/');
  const rows = runs.filter((r) => r.kind === kind && r.arm === arm);
  out[key] = {
    runs: rows.length,
    scored: rows.filter((r) => !r.absent).length,
    [kind === 'review' ? 'recall' : 'f1']: r4(kind === 'review' ? a.recall : a.f1),
    ...(kind === 'localize' ? { precision: r4(a.precision), recall: r4(a.recall) } : {}),
    pluginFired: a['plugin-fired'] ?? null,
    helperRan: a['helper-ran'] ?? null,
    costUsdPerRun: r4(a.costUsd),
    turns: r4(a.turns),
  };
}
console.log(JSON.stringify({ costUsd: result.costUsd, partial: result.partial, out }, null, 2));
