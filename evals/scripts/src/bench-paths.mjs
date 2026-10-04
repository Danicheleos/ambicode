// Where the benchmark harness reads and writes. A leaf module: the harness modules import it, never the reverse.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const BENCHMARKS = path.join(ROOT, 'benchmarks');
export const CASES_DIRECTORY = 'cases';
/** Impact cases name real code, so they live beside the other benchmark data (gitignored, NDA). */
export const IMPACT_CASES_DIRECTORY = 'impact-cases';
export const REUSE_CASES_DIRECTORY = 'reuse-cases';
export const BENCH_EVAL_DIR = 'benchmarks';
/** Never the bare `evals/`: discovery is recursive, so that would sweep every suite at once. */
export const CURATED_EVAL_DIR = 'evals/evals-core';
export const CURATED_CASES = path.join(ROOT, CURATED_EVAL_DIR, CASES_DIRECTORY);
/** The plugin `naked-arm.mjs` builds: no components, so its plugin arm stands in for the no-plugin arm. */
export const NAKED_PLUGIN = 'naked';
