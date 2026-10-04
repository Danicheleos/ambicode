// Builds the naked plugin for `evals:baseline`: a plugin with no components, whose plugin arm is the model
// alone. `claude plugin eval` has no without-only ablation, so this is how the baseline runs one arm.
// Commands: [--out <dir>]. See evals/evals-core/README.md, "Baseline".
import { cpSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BENCHMARKS, CURATED_CASES, FORCED_SUFFIX, NAKED_PLUGIN, ROOT } from './evals-bench.mjs';

export const NAKED_OUT = path.join(ROOT, '.tmp', NAKED_PLUGIN);

/** Forced twins are left out: `withBaseline` measures their no-plugin arm on the neutral twin. */
export function baselineCases(casesDir) {
  return readdirSync(casesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.endsWith(FORCED_SUFFIX))
    .map((entry) => entry.name)
    .sort();
}

export function buildNaked({ out = NAKED_OUT, casesDir = CURATED_CASES, benchmarks = BENCHMARKS } = {}) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(path.join(out, '.claude-plugin'), { recursive: true });
  const manifest = { name: NAKED_PLUGIN, version: '0.0.0', description: 'Eval control: no skills, hooks, servers or commands.' };
  writeFileSync(path.join(out, '.claude-plugin', 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  // The harness refuses symlinks under --eval-dir, so cases are real copies; the scaffolds reach the data through
  // `../../../../benchmarks`, one symlink at the plugin root.
  const cases = baselineCases(casesDir);
  for (const id of cases) cpSync(path.join(casesDir, id), path.join(out, 'evals', 'evals-core', 'cases', id), { recursive: true });
  symlinkSync(benchmarks, path.join(out, 'benchmarks'));
  return { out, cases };
}

function main(argv) {
  let out = NAKED_OUT;
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--out') out = path.resolve(argv[i + 1]);
    else throw new Error(`unknown argument ${argv[i]}; usage: naked-arm.mjs [--out <dir>]`);
  }
  const built = buildNaked({ out });
  console.log(`built ${built.out} with ${built.cases.length} case(s)`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
