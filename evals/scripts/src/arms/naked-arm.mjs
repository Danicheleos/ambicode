// Builds the naked plugin for `evals:baseline`: a plugin with no components, whose plugin arm is the model
// alone. `claude plugin eval` has no without-only ablation, so this is how the baseline runs one arm.
// Commands: [--out <dir>] [--benchmarks <absolute dir>]. See evals/common/core/README.md, "Baseline".
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { BENCHMARKS, BENCHMARKS_CLIMB, CURATED_CASES, CURATED_EVAL_DIR, NAKED_PLUGIN, PRESET_NAMES, presetCasesDir, presetCasesRel, ROOT } from '../shared/bench-paths.mjs';
import { refuseLegacyTwins } from '../cases/bench-cases.mjs';
import { CASES_LOCK, withCasesLock } from '../harness/cases-lock.mjs';
import { GENERATION_MARKER, NAKED_COPY, PROMPT, SWAP_MARKER, WITH_PROMPT } from '../harness/prompt-transport.mjs';

export const NAKED_OUT = path.join(ROOT, '.tmp', NAKED_PLUGIN);

/** Files a control copy never carries: the plugin arm's prompt and the copy it is restored from. */
const PLUGIN_ONLY_FILES = new Set([WITH_PROMPT, NAKED_COPY]);
/** A case.yaml key that could choose a prompt per arm. The shared `execution.prompt` is not one; `prompts`, `prompt_with`, … are. */
const PER_ARM_PROMPT_KEY = /^prompts$|^prompts?[_-]./i;

export function baselineCases(casesDir) {
  refuseLegacyTwins(casesDir);
  return readdirSync(casesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== CASES_LOCK)
    .map((entry) => entry.name)
    .sort();
}

/** case.yaml without per-arm prompt selectors, byte-identical when it has none. */
function controlCaseYaml(source) {
  const doc = parseYaml(source) ?? {};
  let dropped = false;
  const strip = (object) => {
    if (!object || typeof object !== 'object') return;
    for (const key of Object.keys(object))
      if (PER_ARM_PROMPT_KEY.test(key)) {
        delete object[key];
        dropped = true;
      }
  };
  strip(doc);
  strip(doc.execution);
  return dropped ? stringifyYaml(doc) : source;
}

/**
 * A base-commit scaffold's (base-scaffold.mjs) quoted climb to its project, `SIDE="$(cd "$(dirname "$0")"/'../…/benchmarks/<project>' && pwd)"`:
 * the curated climb's pattern cannot rewrite it inside the quotes, so its whole line is replaced.
 */
export const BASE_SCAFFOLD_SIDE = /^SIDE="\$\(cd "\$\(dirname "\$0"\)"\/'(?:\.\.\/)+(?:[\w.-]+\/)*?benchmarks\/([^'\/]+)' && pwd\)"$/m;
export const rebaseScaffold = (text, benchmarks) =>
  text.replace(BENCHMARKS_CLIMB, benchmarks).replace(BASE_SCAFFOLD_SIDE, (_, project) => `SIDE='${path.join(benchmarks, project).replace(/'/g, `'\\''`)}'`);

/** Copies under the cases lock: a run swapping prompts, or a generation, would change the files mid-copy. `evalCases` is where the copies go in the control. */
export function buildNaked({ out = NAKED_OUT, casesDir = CURATED_CASES, benchmarks = BENCHMARKS, evalCases = `${CURATED_EVAL_DIR}/cases` } = {}) {
  return withCasesLock(casesDir, 'naked-arm copy', () => buildLocked({ out, casesDir, benchmarks, evalCases }));
}

function buildLocked({ out, casesDir, benchmarks, evalCases }) {
  // A swapped prompt.md is the plugin prompt; copied now, the control would serve it on every baseline run.
  for (const marker of [SWAP_MARKER, GENERATION_MARKER])
    if (existsSync(path.join(casesDir, marker)))
      throw new Error(`${casesDir} has ${marker}: restore an outstanding swap with \`evals-bench.mjs restore-prompts\`, or regenerate interrupted cases with \`select --regenerate\`, then build again`);
  const cases = baselineCases(casesDir);
  for (const id of cases) {
    const naked = path.join(casesDir, id, NAKED_COPY);
    if (existsSync(naked) && !readFileSync(path.join(casesDir, id, PROMPT)).equals(readFileSync(naked)))
      throw new Error(`case ${id}: prompt.md is not the generated naked prompt (an interrupted swap whose marker is gone?): regenerate the cases`);
  }
  rmSync(out, { recursive: true, force: true });
  mkdirSync(path.join(out, '.claude-plugin'), { recursive: true });
  const manifest = { name: NAKED_PLUGIN, version: '0.0.0', description: 'Eval control: no skills, hooks, servers or commands.' };
  writeFileSync(path.join(out, '.claude-plugin', 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  // The harness refuses symlinks under the eval directory, so cases are real copies and each scaffold reaches the
  // data by absolute path instead of the relative climb.
  for (const id of cases) {
    const to = path.join(out, ...evalCases.split('/'), id);
    cpSync(path.join(casesDir, id), to, { recursive: true, filter: (source) => !PLUGIN_ONLY_FILES.has(path.basename(source)) || path.dirname(source) !== path.join(casesDir, id) });
    const caseYaml = path.join(to, 'case.yaml');
    if (existsSync(caseYaml)) writeFileSync(caseYaml, controlCaseYaml(readFileSync(caseYaml, 'utf8')));
    const scaffold = path.join(to, 'scaffold.sh');
    if (existsSync(scaffold)) writeFileSync(scaffold, rebaseScaffold(readFileSync(scaffold, 'utf8'), benchmarks));
  }
  return { out, cases };
}

export function parseArgs(argv) {
  const options = { out: NAKED_OUT, benchmarks: BENCHMARKS };
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1];
    if (argv[i] === '--out' && value) options.out = path.resolve(value);
    else if (argv[i] === '--preset' && value) {
      if (!PRESET_NAMES.includes(value)) throw new Error(`--preset takes ${PRESET_NAMES.join(', ')}, not ${value}`);
      options.casesDir = presetCasesDir(value);
      options.evalCases = `evals/${presetCasesRel(value)}`;
    }
    // The symlink's target is stored as given, so a relative one would resolve from inside the plugin.
    else if (argv[i] === '--benchmarks' && value) {
      if (!path.isAbsolute(value)) throw new Error(`--benchmarks takes an absolute path, not ${value}`);
      options.benchmarks = value;
    } else throw new Error(`unknown argument ${argv[i]}; usage: naked-arm.mjs [--out <dir>] [--benchmarks <absolute dir>] [--preset <name>]`);
  }
  return options;
}

function main(argv) {
  const built = buildNaked(parseArgs(argv));
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
