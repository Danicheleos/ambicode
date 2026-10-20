// Runs the suite through `claude plugin eval` and leaves the result in evals/cases/results.
// Usage: run.mjs [--bare] [--case <glob>] [--tag <tag>] [--runs <n>] [--model <m>] [--effort <level>]
//                [--max-cost-usd <usd>] [--dry-run]
// --bare runs evals/bare/ against an empty plugin: the same requests with nothing of AMBICODE loaded.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { harvest } from './context.mjs';
import { CASES, caseOf } from './cases.mjs';
import { metricsOf } from './metrics.mjs';
import { NAVIGATOR_TAG, isNavigatorCase, navigatorMetrics, navigatorTruth } from './navigator-cases.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const DEFAULTS = { model: 'claude-sonnet-5-5', effort: 'low', runs: '1', maxCostUsd: '15', concurrency: '4' };
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RESULTS = path.join(REPO, 'evals', 'cases', 'results');
// Outside the plugin, because the harness walks the whole target directory; .tmp/ is gitignored.
export const NAKED = path.join(REPO, '.tmp', 'naked');

function option(argv, name) {
  const at = argv.indexOf(name);
  return at >= 0 ? (argv[at + 1] ?? null) : null;
}

/** The harness argv and environment of one run; everything is fixed here so the run can be reproduced. */
export function plan(argv, defaults = DEFAULTS, results = RESULTS) {
  const arm = argv.includes('--bare') ? 'bare' : 'plugin';
  const model = option(argv, '--model') ?? defaults.model;
  const effort = option(argv, '--effort') ?? defaults.effort;
  const result = path.join(results, `${arm}.json`);
  const out = [
    'plugin', 'eval', arm === 'bare' ? NAKED : REPO,
    '--eval-dir', arm === 'bare' ? 'evals/bare' : 'evals/cases',
    '--scaffold', '--trust-plugin', '--no-publish',
    // Kept so the context size can be read from each trace; harvest() deletes every sandbox afterwards.
    '--keep-temp',
    // One arm per run: a plugin case's prompt types /ambicode:<skill>, which means nothing with no plugin loaded.
    '--ablation', 'none',
    // The plugin navigator arm only relays the navigator, which reads with Read and Grep: no shell for the session.
    ...(arm === 'plugin' && option(argv, '--tag') === NAVIGATOR_TAG ? [] : ['--allow-tools', 'Bash', 'Edit', 'Write']),
    '--model', model,
    '--runs', option(argv, '--runs') ?? defaults.runs,
    '-j', defaults.concurrency,
    '--max-cost-usd', option(argv, '--max-cost-usd') ?? defaults.maxCostUsd,
    '--json', result,
  ];
  for (const name of ['--case', '--tag']) {
    const value = option(argv, name);
    if (value !== null) out.push(name, value);
  }
  // The harness has no exclude option: an unfiltered run lists the skill tags, which the navigator cases do not carry.
  if (option(argv, '--case') === null && option(argv, '--tag') === null) {
    for (const tag of new Set(CASES.flatMap((one) => one.tags))) out.push('--tag', tag);
  }
  // The harness has no effort flag; the variable reaches the run's claude child (probed 2026-10-12: `env=[low]`).
  const env = { CLAUDE_CODE_EFFORT_LEVEL: effort };
  return { arm, argv: out, env, result };
}

/** An empty plugin holding a copy of evals/bare, with each scaffold pointed back at this repository's fixtures. */
export function buildNaked(repo = REPO, naked = NAKED) {
  rmSync(naked, { recursive: true, force: true });
  mkdirSync(path.join(naked, '.claude-plugin'), { recursive: true });
  writeFileSync(path.join(naked, '.claude-plugin', 'plugin.json'), `${JSON.stringify({ name: 'naked', version: '0.0.0', description: 'No components: the bare arm.' })}\n`);
  const target = path.join(naked, 'evals', 'bare');
  cpSync(path.join(repo, 'evals', 'bare'), target, { recursive: true });
  for (const name of readdirSync(target)) {
    const file = path.join(target, name, 'scaffold.sh');
    try {
      writeFileSync(file, readFileSync(file, 'utf8').replaceAll('$(cd "$(dirname "$0")/../../.." && pwd)', repo), { mode: 0o755 });
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
  }
}

// Either variable overrides every subagent's model, so an inherited one hides the agent's own `model:` (seen 2026-10-20: haiku navigator ran on sonnet).
export function childEnv(base, env) {
  const out = { ...base, ...env };
  delete out.CLAUDE_CODE_SUBAGENT_MODEL;
  delete out.CLAUDE_CODE_SUBAGENT_MODEL_FORCE;
  return out;
}

const REAL = {
  spawn: (cmd, args, env) => spawnSync(cmd, args, { stdio: 'inherit', env: childEnv(process.env, env) }).status,
  harvest,
  truthOf: navigatorTruth,
  tracesRoot: path.join(RESULTS, 'traces'),
};

/** Recall of a navigator run as the recall-NN graders scored it: passed / total; undefined when the case has none. */
export function recallOfGraders(graders) {
  const recalls = (graders ?? []).filter((grader) => /^recall-\d+-/.test(grader.name));
  return recalls.length === 0 ? undefined : Number((recalls.filter((grader) => grader.passed).length / recalls.length).toFixed(3));
}

/**
 * Navigator metrics: precision, F1 and the folder lists from scoreNavigator, recall pinned to the graders. A computed recall that
 * differs is a bug in one of the two, so the grader value is written and `mismatch` is set instead of hiding it.
 */
export function navigatorRunMetrics(truth, traceText, graders) {
  const graded = recallOfGraders(graders);
  if (truth === null || traceText === undefined) return graded === undefined ? {} : { recall: graded };
  const metrics = navigatorMetrics(truth, traceText);
  if (graded !== undefined && graded !== metrics.recall) return { ...metrics, recall: graded, mismatch: true };
  return metrics;
}

/** One `claude plugin eval` call: harvest, metrics; leaves run.result holding this call's result. */
export function runCase(run, deps = REAL) {
  const status = deps.spawn('claude', run.argv, run.env);
  // Exit 1 is a case below the harness threshold (1.0) and 2 a partial result (cost ceiling): both are results
  // (`partial` is the harness's own flag in the JSON). Anything else is a harness failure with no result.
  if (![0, 1, 2].includes(status)) return { status: status ?? 1, result: null };
  const result = JSON.parse(readFileSync(run.result, 'utf8'));
  const stamp = String(result.startedAt ?? Date.now()).replace(/[:.]/g, '-');
  // Per suite run: clearing one shared folder lost the traces of every earlier run (2026-10-12).
  deps.harvest(result, path.join(deps.tracesRoot, run.arm, stamp));
  for (const evalCase of result.cases ?? []) {
    const navigator = isNavigatorCase(evalCase.name);
    const spec = navigator ? undefined : caseOf(evalCase.name)?.metrics;
    if (!navigator && spec === undefined) continue;
    for (const runs of Object.values(evalCase.arms ?? {})) for (const one of runs ?? []) {
      if (navigator) one.metrics = navigatorRunMetrics(deps.truthOf?.(evalCase.name) ?? null, one.trace ? readFileSync(one.trace, 'utf8') : undefined, one.graders);
      else if (one.trace) one.metrics = metricsOf(spec, readFileSync(one.trace, 'utf8'));
    }
  }
  writeFileSync(run.result, `${JSON.stringify(result, null, 2)}\n`);
  // The viewer reads one copy per run (<results>/<stamp>/); the harness's own copy there lacks our fields, so the viewer
  // computed its own metrics (2026-10-19: graders 0.244, viewer recall 0.111). The bare arm's harness copy lands in the
  // naked plugin, which buildNaked wipes, so that arm gets its copy under <results>/bare/.
  const own = path.join(path.dirname(run.result), ...(run.arm === 'bare' ? ['bare'] : []), stamp, 'aggregate-result.json');
  mkdirSync(path.dirname(own), { recursive: true });
  writeFileSync(own, `${JSON.stringify(result, null, 2)}\n`);
  return { status, result };
}

function main(argv) {
  const run = plan(argv);
  if (argv.includes('--dry-run')) {
    console.log(`${Object.entries(run.env).map(([k, v]) => `${k}=${v}`).join(' ')} claude ${run.argv.join(' ')}`);
    return 0;
  }
  mkdirSync(RESULTS, { recursive: true });
  if (run.arm === 'bare') buildNaked();
  return runCase(run).status;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
