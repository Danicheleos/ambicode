// Where the benchmark harness reads and writes. A leaf module: the harness modules import it, never the reverse.
// Layout: evals/ holds the suites that run, the full sets included (evals/<project>/full). The assets folder, beside the
// repo, holds benchmarks/<project>/ (the sources), outputs/<eval type>/<date>/<iteration>/ (raw results) and reports/.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
/** Benchmark data, raw outputs and reports. The harness walks the whole plugin directory and refuses one over 20,000 entries, so this lives outside the repo. */
export const ASSETS = path.resolve(process.env.AMBICODE_EVALS_ASSETS ?? path.join(ROOT, '..', 'ambicode-evals-assets'));
export const BENCHMARKS = path.join(ASSETS, 'benchmarks');
/**
 * A case's side is its benchmark project: `<benchmarks>/<project>/` holds `.git/` (history), `project/` (the code
 * checkout and its `.ambicode/config.yaml`), `assets/` (tickets) and `reviews/` (prepared review versions).
 */
/** Each TypeScript project's code root inside its checkout: where the impact and reuse generators read the code. */
export const PROJECT_CODE_ROOTS = Object.freeze({ 'BE-express': 'src', 'FE-angular': 'main' });
export const BENCH_PROJECTS = Object.freeze(Object.keys(PROJECT_CODE_ROOTS));
export const PROJECT_CODE_DIRECTORY = 'project';
export const projectCodeDir = (benchmarks, project) => path.join(benchmarks, project, PROJECT_CODE_DIRECTORY);
/** Case names and tags keep the short prefix (`be`, `fe`), so they stay comparable with runs from before the rename. */
export const casePrefix = (project) => project.split('-')[0].toLowerCase();
export const CASES_ROOT = path.join(ROOT, 'evals');
/** Raw eval output (results, traces, walkthroughs), gitignored; see `iterationDir` in harness/run-options.mjs. */
export const OUTPUTS = path.join(ASSETS, 'outputs');
export const REPORTS = path.join(ASSETS, 'reports');
export const CASES_DIRECTORY = 'cases';
/** Impact and reuse cases name real code, so they live under their project's folder (gitignored, NDA). */
export const IMPACT_CASES_DIRECTORY = 'impact';
export const REUSE_CASES_DIRECTORY = 'reuse';
/** A project's full generated set: inside the plugin, since `--eval-dir` must be below it. */
export const FULL_CASES_DIRECTORY = 'full';
export const REUSE_EXPORTS_FILE = 'exports.json';
export const projectCasesDir = (kind, project, casesRoot = CASES_ROOT) => path.join(casesRoot, project, kind);
export const fullEvalDir = (project) => `evals/${project}/${FULL_CASES_DIRECTORY}`;
/** A scaffold's climb to the benchmarks, whatever folders the assets sit under; arms rewrite it. */
export const BENCHMARKS_CLIMB = /(\$\(dirname "\$0"\)\/)(?:\.\.\/)+(?:[\w.-]+\/)*?benchmarks(?=\/)/g;
/** Never the bare `evals/`: discovery is recursive, so that would sweep every suite at once. */
export const CURATED_EVAL_DIR = 'evals/common/core';
export const CURATED_CASES = path.join(ROOT, CURATED_EVAL_DIR, CASES_DIRECTORY);
/** The pinned naked baseline: every score, gate, report and `select` compares against it. Gitignored with the rest of core/, as its numbers derive from the benchmark. */
export const BASELINE_LOCK_FILE = path.join(ROOT, CURATED_EVAL_DIR, 'baseline.lock.json');
export const TASK_EVAL_DIR = 'evals/common/task';
export const TRIGGERS_EVAL_DIR = 'evals/common/triggers';
export const ARCHIVED_EVAL_DIR = 'evals/common/archived';
/**
 * Reviewer answers recorded against the review cases, replayed by `EVAL_AMBICODE_REVIEWER_REPLAY`. Beside the
 * suites, never inside an `--eval-dir`: the sandbox denies reads there, and the replay runs inside the sandbox.
 */
export const REVIEWER_RECORDINGS = path.join(CASES_ROOT, 'common', 'reviewer-recordings');
export const CURATED_REVIEWER_RECORDINGS = path.join(ROOT, 'eval-replay', 'core.json');
/** Per-thread `defect` / `opinion` labels (see classify-threads.mjs); the review cases keep only the defects. */
export const THREAD_CLASSES = path.join(BENCHMARKS, 'thread-classes.json');
/** Each run's `plugin-eval/` (report.html, aggregate-result.json) is copied to `<this>/<date>/<iteration>/`; the originals stay in the iteration. */
export const REPLAY_REPORTS = path.join(ROOT, 'eval-replay');
/** The synthetic archived suite's recordings; committed, unlike the curated ones. */
export const ARCHIVED_REVIEWER_RECORDINGS = path.join(REVIEWER_RECORDINGS, 'archived.json');
/** The plugin `naked-arm.mjs` builds: no components, so its plugin arm stands in for the no-plugin arm. */
export const NAKED_PLUGIN = 'naked';
