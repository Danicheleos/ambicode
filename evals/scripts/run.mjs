// Runs the skill-coverage suite through `claude plugin eval` and records the result in the history.
// Usage: run.mjs [--case <glob>] [--tag <tag>] [--runs <n>] [--model <m>] [--max-cost-usd <usd>]
//                [--ablation none|with-without] [--dry-run]
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const DEFAULTS = { model: 'claude-sonnet-5-5', runs: '1', maxCostUsd: '15', ablation: 'none', concurrency: '4' };
export const EVAL_DIR = 'evals/cases';
export const RESULT = `${EVAL_DIR}/results/latest.json`;

function option(argv, name) {
  const at = argv.indexOf(name);
  return at >= 0 ? (argv[at + 1] ?? null) : null;
}

/** The harness argv for one run; everything the suite needs is fixed here so a run is reproducible from the history row. */
export function harnessArgv(argv, defaults = DEFAULTS) {
  const model = option(argv, '--model') ?? defaults.model;
  const out = [
    'plugin', 'eval', '.',
    '--eval-dir', EVAL_DIR,
    '--scaffold', '--trust-plugin', '--no-publish',
    '--ablation', option(argv, '--ablation') ?? defaults.ablation,
    '--allow-tools', 'Bash', 'Edit', 'Write',
    '--model', model,
    '--runs', option(argv, '--runs') ?? defaults.runs,
    '-j', defaults.concurrency,
    '--max-cost-usd', option(argv, '--max-cost-usd') ?? defaults.maxCostUsd,
    '--json', RESULT,
  ];
  for (const name of ['--case', '--tag']) {
    const value = option(argv, name);
    if (value !== null) out.push(name, value);
  }
  return { argv: out, model };
}

function main(argv) {
  const plan = harnessArgv(argv);
  const track = ['evals/scripts/track.mjs', RESULT, '--model', plan.model];
  if (argv.includes('--dry-run')) {
    console.log(`claude ${plan.argv.join(' ')}\nnode ${track.join(' ')}`);
    return 0;
  }
  const run = spawnSync('claude', plan.argv, { stdio: 'inherit' });
  // Exit 1 is a case below the harness threshold (1.0) and 2 a partial result (cost ceiling): both are results and are
  // tracked (`partial` is the harness's own flag in the JSON). Anything else is a harness failure with nothing to track.
  if (![0, 1, 2].includes(run.status)) return run.status ?? 1;
  const tracked = spawnSync(process.execPath, track, { stdio: 'inherit' });
  return tracked.status === 0 ? run.status : (tracked.status ?? 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
