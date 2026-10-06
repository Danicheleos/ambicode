// Where the benchmark harness reads and writes. A leaf module: the harness modules import it, never the reverse.
// Layout: evals/benchmarks/<project>/{project,cases} holds the sources; evals/cases holds the suites that
// run; evals/outputs/<eval type>/<date>/<iteration>/ holds raw results; evals/reports holds analyses of them.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
export const BENCHMARKS = path.join(ROOT, 'evals', 'benchmarks');
/**
 * A case's side is its benchmark project: `<benchmarks>/<project>/` holds `.git/` (history), `project/` (the code
 * checkout and its `.ambicode/config.yaml`), `assets/` (tickets), `reviews/` (prepared review versions) and `cases/`.
 */
/** Each TypeScript project's code root inside its checkout: where the impact and reuse generators read the code. */
export const PROJECT_CODE_ROOTS = Object.freeze({ 'BE-express': 'src', 'FE-angular': 'main' });
export const BENCH_PROJECTS = Object.freeze(Object.keys(PROJECT_CODE_ROOTS));
export const PROJECT_CODE_DIRECTORY = 'project';
export const projectCodeDir = (benchmarks, project) => path.join(benchmarks, project, PROJECT_CODE_DIRECTORY);
/** Case names and tags keep the short prefix (`be`, `fe`), so they stay comparable with runs from before the rename. */
export const casePrefix = (project) => project.split('-')[0].toLowerCase();
export const CASES_ROOT = path.join(ROOT, 'evals', 'cases');
/** Raw eval output (results, traces, walkthroughs), gitignored; see `iterationDir` in harness/run-options.mjs. */
export const OUTPUTS = path.join(ROOT, 'evals', 'outputs');
export const REPORTS = path.join(ROOT, 'evals', 'reports');
export const CASES_DIRECTORY = 'cases';
/** Impact and reuse cases name real code, so they live under their project's folder (gitignored, NDA). */
export const IMPACT_CASES_DIRECTORY = 'impact';
export const REUSE_CASES_DIRECTORY = 'reuse';
export const REUSE_EXPORTS_FILE = 'exports.json';
export const projectCasesDir = (kind, project, casesRoot = CASES_ROOT) => path.join(casesRoot, project, kind);
export const BENCH_EVAL_DIR = 'evals/benchmarks';
/** Never the bare `evals/`: discovery is recursive, so that would sweep every suite at once. */
export const CURATED_EVAL_DIR = 'evals/cases/common/core';
export const CURATED_CASES = path.join(ROOT, CURATED_EVAL_DIR, CASES_DIRECTORY);
export const TASK_EVAL_DIR = 'evals/cases/common/task';
export const TRIGGERS_EVAL_DIR = 'evals/cases/common/triggers';
export const ARCHIVED_EVAL_DIR = 'evals/cases/common/archived';
/**
 * Reviewer answers recorded against the review cases, replayed by `EVAL_AMBICODE_REVIEWER_REPLAY`. Beside the
 * suites, never inside an `--eval-dir`: the sandbox denies reads there, and the replay runs inside the sandbox.
 */
export const REVIEWER_RECORDINGS = path.join(CASES_ROOT, 'common', 'reviewer-recordings');
export const CURATED_REVIEWER_RECORDINGS = path.join(REVIEWER_RECORDINGS, 'core.json');
/** The synthetic archived suite's recordings; committed, unlike the curated ones. */
export const ARCHIVED_REVIEWER_RECORDINGS = path.join(REVIEWER_RECORDINGS, 'archived.json');
/** The plugin `naked-arm.mjs` builds: no components, so its plugin arm stands in for the no-plugin arm. */
export const NAKED_PLUGIN = 'naked';
