import path from 'node:path';

/** The repository root and its `src/`, so a test's paths do not depend on how deep the test file sits. */
export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
export const SRC_ROOT = path.join(REPO_ROOT, 'src');
