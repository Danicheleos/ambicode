// Runs the suite through `claude plugin eval` and leaves the result in evals/cases/results.
// Usage: run.mjs [--bare] [--case <glob>] [--tag <tag>] [--runs <n>] [--model <m>] [--effort <level>]
//                [--max-cost-usd <usd>] [--series <case1,case2,...>] [--dry-run]
// --series names every case of a series of one-case commands; each command updates results/running.json (see progressOf).
// --bare runs evals/bare/ against an empty plugin: the same requests with nothing of AMBICODE loaded.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { archiveOf, harvest, reviewRunsOf } from './context.mjs';
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
  for (const entry of readdirSync(target, { recursive: true })) {
    if (path.basename(entry) !== 'scaffold.sh') continue;
    const file = path.join(target, entry);
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('$(cd "$(dirname "$0")/../../../.." && pwd)', repo), { mode: 0o755 });
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
  const tracesDir = path.join(deps.tracesRoot, run.arm, stamp);
  deps.harvest(result, tracesDir, { archiveDir: archiveOf(tracesDir), reviewRunsDir: reviewRunsOf(run.arm, stamp) });
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

/**
 * The progress file of a series of commands, read by plugin-master's Evals view: <results>/running.json, no schemaVersion key
 * (the view lists every results/*.json that has one as a finished run). A command with no --series is a one-case series.
 */
export const seriesOf = (argv) => {
  const list = (option(argv, '--series') ?? option(argv, '--case') ?? '').split(',').map((name) => name.trim()).filter(Boolean);
  return list.length === 0 ? null : list;
};

const score = (runs) => {
  const scores = runs.map((one) => one.score).filter((value) => typeof value === 'number');
  return scores.length === 0 ? null : Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3));
};
const cost = (runs) => Number(runs.reduce((sum, one) => sum + (one.costUsd ?? 0) + (one.judgeCostUsd ?? 0), 0).toFixed(4));

/** Runs of the case named `name` in a harness result (every run when the name is a glob matching none exactly). */
const runsOfCase = (result, name) => {
  const all = result.cases ?? [];
  const own = all.filter((one) => one.name === name);
  return (own.length > 0 ? own : all).flatMap((one) => Object.values(one.arms ?? {}).flat());
};

/** Runs `exec` (one command's harness call) around updates of the progress file; a failure to write it only warns, once. */
export function withProgress(run, argv, exec, { file = path.join(path.dirname(run.result), 'running.json'), now = () => new Date() } = {}) {
  const list = seriesOf(argv);
  const name = option(argv, '--case');
  let warned = false;
  const guard = (step) => {
    try {
      return step();
    } catch (error) {
      if (!warned) console.warn(`progress file not written: ${error.message}`);
      warned = true;
      return undefined;
    }
  };
  const id = list === null ? null : createHash('sha1').update(`${run.arm}\n${list.join(',')}`).digest('hex').slice(0, 8);
  const load = () => {
    let state = null;
    try {
      state = JSON.parse(readFileSync(file, 'utf8'));
    } catch {}
    if (state?.series === id && state.finishedAt === null) return state;
    const stamp = now().toISOString();
    return { kind: 'eval-series', series: id, arm: run.arm, startedAt: stamp, updatedAt: stamp, finishedAt: null, runsPerCase: Number(option(argv, '--runs') ?? DEFAULTS.runs), total: 0, done: 0, current: null, costUsd: 0, cases: list.map((one) => ({ name: one, state: 'queued', score: null, costUsd: null })) };
  };
  const save = (state) => {
    state.total = state.cases.length;
    state.done = state.cases.filter((one) => one.state === 'done' || one.state === 'failed').length;
    state.costUsd = Number(state.cases.reduce((sum, one) => sum + (one.costUsd ?? 0), 0).toFixed(4));
    state.updatedAt = now().toISOString();
    state.finishedAt = state.done === state.total ? state.updatedAt : null;
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
    renameSync(tmp, file);
  };
  const entry = (state) => {
    let found = state.cases.find((one) => one.name === name);
    if (found === undefined) state.cases.push((found = { name, state: 'queued', score: null, costUsd: null }));
    return found;
  };
  if (list !== null && name !== null) guard(() => {
    const state = load();
    entry(state).state = 'running';
    state.current = name;
    save(state);
  });
  let outcome;
  try {
    outcome = exec();
  } catch (error) {
    outcome = { status: 1, result: null, error };
  }
  if (list !== null && name !== null) guard(() => {
    const state = load();
    const one = entry(state);
    const runs = outcome.result === null ? [] : runsOfCase(outcome.result, name);
    one.state = outcome.result === null ? 'failed' : 'done';
    one.score = score(runs);
    one.costUsd = outcome.result === null ? null : cost(runs);
    state.current = null;
    save(state);
  });
  if (outcome.error) throw outcome.error;
  return outcome;
}

function main(argv) {
  const run = plan(argv);
  if (argv.includes('--dry-run')) {
    console.log(`${Object.entries(run.env).map(([k, v]) => `${k}=${v}`).join(' ')} claude ${run.argv.join(' ')}`);
    return 0;
  }
  mkdirSync(RESULTS, { recursive: true });
  if (run.arm === 'bare') buildNaked();
  return withProgress(run, argv, () => runCase(run)).status;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
