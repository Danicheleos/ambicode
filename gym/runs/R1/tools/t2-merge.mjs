#!/usr/bin/env node
// Usage: t2-merge.mjs --out <merged.json> <base-result.json> <case-result.json>...
// Combines one T2 sweep with per-case reruns into one result file that `evals-bench.mjs score`
// reads, then prints the pooled arms and the per-run-index medians the decision table uses.
//
// Why it exists: the R1 baseline sweep (eval-2026-09-29T01-43-58-769Z) was killed with its
// session after 13 of 18 cases, $41.04 spent. A full rerun (~$57) did not fit under the $90
// stop, so the 5 unfinished cases were rerun alone; `claude plugin eval --case` is not
// repeatable (evals/scripts/src/evals-preflight.test.mjs:119), hence one file per case.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { score } from '../../../../evals/scripts/src/evals-bench.mjs';

const RUNS = 3;
const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
if (outAt < 0 || !args[outAt + 1]) throw new Error('usage: t2-merge.mjs --out <merged.json> <base.json> <case.json>...');
const out = args[outAt + 1];
const [baseFile, ...caseFiles] = args.filter((_, i) => i !== outAt && i !== outAt + 1);
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));

// A case counts as complete only with RUNS error-free runs in every arm; anything else is
// taken from a rerun or reported missing, never scored from a fragment.
const complete = (c) => Object.values(c.arms ?? {}).length === 2 && Object.values(c.arms).every((runs) => runs.length === RUNS && runs.every((r) => !r.error));

const sources = [baseFile, ...caseFiles].map((f) => ({ file: path.basename(f), data: read(f) }));
const chosen = new Map();
const dropped = [];
for (const { file, data } of sources)
  for (const c of data.cases ?? []) {
    if (complete(c)) chosen.set(c.name, { file, c });
    else dropped.push({ file, case: c.name, runs: Object.fromEntries(Object.entries(c.arms ?? {}).map(([a, r]) => [a, `${r.length} runs, ${r.filter((x) => x.error).length} errors`])) });
  }

const cases = [...chosen.values()].map(({ c }) => c).sort((a, b) => a.name.localeCompare(b.name));
const merged = {
  schemaVersion: sources[0].data.schemaVersion,
  suite: sources[0].data.suite,
  claudeVersion: [...new Set(sources.map((s) => s.data.claudeVersion))].join(','),
  startedAt: sources[0].data.startedAt,
  // Money spent, including the runs of dropped fragments: they were paid for.
  costUsd: sources.reduce((a, s) => a + (s.data.costUsd ?? 0), 0),
  durationSeconds: sources.reduce((a, s) => a + (s.data.durationSeconds ?? 0), 0),
  partial: sources.some((s) => s.data.partial && s.file !== sources[0].file) || dropped.some((d) => !chosen.has(d.case)),
  mergedFrom: sources.map((s) => ({ file: s.file, partial: s.data.partial, partialReason: s.data.partialReason ?? null, costUsd: s.data.costUsd, cases: (s.data.cases ?? []).map((c) => c.name), used: [...chosen.values()].filter((v) => v.file === s.file).map((v) => v.c.name) })),
  dropped,
  cases,
};
writeFileSync(out, JSON.stringify(merged, null, 2));

const { runs, arms } = score(merged);
const median = (xs) => {
  const s = xs.filter((x) => x !== null).sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
// A "sweep" is one run index across every case, which is what a 1-run/arm sweep measures.
const perRunIndex = {};
for (const key of Object.keys(arms).filter((k) => k.split('/').length === 2)) {
  const [kind, arm] = key.split('/');
  const metric = kind === 'review' ? 'recall' : 'f1';
  const sweeps = [];
  for (let i = 0; i < RUNS; i++) {
    const rows = runs.filter((r) => r.kind === kind && r.arm === arm && r.run === i);
    const scored = rows.filter((r) => !r.absent);
    sweeps.push({
      run: i,
      [metric]: scored.length ? scored.reduce((a, r) => a + r[metric], 0) / scored.length : null,
      scored: scored.length,
      helperRan: rows.filter((r) => r.graders['helper-ran']).length,
      costUsd: rows.reduce((a, r) => a + (r.costUsd ?? 0), 0),
    });
  }
  perRunIndex[key] = { metric, sweeps, median: median(sweeps.map((s) => s[metric])), helperRanMedian: median(sweeps.map((s) => s.helperRan)) };
}
const allCases = new Set(sources.flatMap((s) => (s.data.cases ?? []).map((c) => c.name)));
console.log(JSON.stringify({ out, cases: cases.length, missing: [...allCases].filter((n) => !chosen.has(n)), partial: merged.partial, costUsd: merged.costUsd, durationSeconds: merged.durationSeconds, perRunIndex, arms }, null, 2));
