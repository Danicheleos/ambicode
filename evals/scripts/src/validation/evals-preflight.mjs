// Gate in front of a sweep: refuses unless the plugin fired, the helper ran, the review
// completed and a unit check executed. Needs model access; costs about $0.4–0.7.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ARCHIVED_EVAL_DIR as ARCHIVED_SUITES, ROOT } from '../shared/bench-paths.mjs';

// Relative to the plugin root, as `--eval-dir` takes it.
export const ARCHIVED_EVAL_DIR = `${ARCHIVED_SUITES}/typescript`;

// Above the $0.4–0.7 estimate, so a normal run never trips it, and far below
// a sweep, so a broken setup costs this at most.
export const PREFLIGHT_MAX_COST_USD = 1.5;

/**
 * `expectedToFail` is printed and never counted as a pass: a task case's agent-written diff is only
 * reviewed when the agent launches the reviewer subagent, which the case does not ask for.
 */
export const PREFLIGHT = [
  { case: 'regression-ts', require: ['plugin-fired', 'helper-ran', 'reviewer-completed', 'unit-check-ran'] },
  {
    case: 'p2-task-regression-fix',
    require: ['plugin-fired', 'helper-ran', 'unit-check-ran'],
    expectedToFail: {
      'reviewer-completed':
        'the agent writes this diff and may not launch the reviewer subagent for it',
    },
  },
];

export function preflightArgs(jsonPath, extra = []) {
  return [
    'plugin', 'eval', ROOT,
    '--eval-dir', ARCHIVED_EVAL_DIR,
    '--tag', 'preflight',
    '--runs', '1',
    '--ablation', 'none',
    '-j', '2',
    '--scaffold',
    '--allow-tools', 'Bash', 'WebFetch(domain:api.anthropic.com)',
    '--no-publish',
    '--max-cost-usd', String(PREFLIGHT_MAX_COST_USD),
    // The score is not the question; this script decides from the graders.
    '--threshold', '0',
    '--json', jsonPath,
    ...extra,
  ];
}

/** Anything absent (a case, a run, a grader) is a failure, so a renamed grader cannot make the gate vacuous. */
export function judge(result, preflight = PREFLIGHT) {
  const lines = [];
  let ok = true;
  const fail = (line) => {
    ok = false;
    lines.push(`FAIL  ${line}`);
  };

  if (result.partial) fail(`the run is partial (${result.partialReason ?? 'no reason given'}); it proves nothing`);
  const expected = new Set(preflight.map((entry) => entry.case));
  for (const extra of (result.cases ?? []).filter((c) => !expected.has(c.name))) {
    fail(`${extra.name}: carries the preflight tag but is not a preflight case`);
  }

  for (const entry of preflight) {
    const matches = (result.cases ?? []).filter((c) => c.name === entry.case);
    if (matches.length !== 1) {
      fail(`${entry.case}: ${matches.length} result(s), expected 1`);
      continue;
    }
    const runs = matches[0].arms?.with ?? [];
    if (runs.length === 0) {
      fail(`${entry.case}: no run of the with arm`);
      continue;
    }
    for (const [index, run] of runs.entries()) {
      const where = runs.length === 1 ? entry.case : `${entry.case} run ${index + 1}`;
      if (run.error) fail(`${where}: the run errored: ${run.error}`);
      const graders = new Map((run.graders ?? []).map((grader) => [grader.name, grader]));
      for (const name of entry.require) {
        const grader = graders.get(name);
        if (grader === undefined) fail(`${where} ${name}: no such grader in the result`);
        else if (grader.passed !== true) fail(`${where} ${name}: ${grader.explanation ?? 'failed'}`);
        else lines.push(`PASS  ${where} ${name}`);
      }
      for (const [name, reason] of Object.entries(entry.expectedToFail ?? {})) {
        const grader = graders.get(name);
        const state = grader === undefined ? 'absent' : grader.passed ? 'passed' : 'failed';
        lines.push(`NOTE  ${where} ${name}: ${state}, not gated: ${reason}`);
      }
    }
  }
  return { ok, lines };
}

async function main(extra) {
  if (!existsSync(path.join(ROOT, 'scripts', 'ambicode.mjs'))) {
    throw new Error('scripts/ambicode.mjs is missing: run `npm run build` first');
  }
  const jsonPath = path.join(await mkdtemp(path.join(tmpdir(), 'ambicode-preflight-')), 'result.json');
  const child = spawnSync('claude', preflightArgs(jsonPath, extra), { stdio: 'inherit' });
  if (!existsSync(jsonPath)) {
    throw new Error(`claude plugin eval wrote no result (exit ${child.status ?? child.signal}); the preflight did not run`);
  }
  const result = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const { ok, lines } = judge(result);
  process.stdout.write(`\npreflight ($${Number(result.costUsd ?? 0).toFixed(2)}, ${jsonPath})\n${lines.join('\n')}\n`);
  process.stdout.write(ok ? 'preflight passed\n' : 'preflight FAILED: fix the setup before a sweep\n');
  return ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    },
  );
}
