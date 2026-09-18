/**
 * The one place these numbers exist. Skills and guides reference
 * `ambicode config` output rather than repeating them (doc 05).
 */
export const DEFAULTS = {
  schemaVersion: 1 as const,
  review: {
    model: 'sonnet',
    timeoutSeconds: 300,
    maxFindings: 7,
    maxChangedFiles: 50,
    maxChangedLines: 2000,
    maxContextBytes: 524_288,
  },
  checks: {
    timeoutSeconds: 120,
    maxSelectedTestFiles: 20,
  },
  page: {
    idleTimeoutSeconds: 1800,
  },
  remoteChecks: {
    image: null,
  },
} as const;

/** Bounded capture for any single command; larger output is truncated with a notice. */
export const MAX_COMMAND_OUTPUT_BYTES = 262_144;

/**
 * Snapshot budgets. These bound what is written to disk for the reviewer to
 * read; `review.maxContextBytes` separately bounds the prompt itself, so the
 * two are not interchangeable.
 */
export const MAX_SNAPSHOT_FILE_BYTES = 262_144;
export const MAX_SNAPSHOT_TOTAL_BYTES = 4 * 1024 * 1024;

export const CONFIG_DIR = '.ambicode';
export const CONFIG_FILE = '.ambicode/config.yaml';
export const REVIEWS_DIR = '.ambicode/reviews';
export const PROJECT_POLICIES_DIR = '.ambicode/policies';

/** Entries first-run setup may add, preserving whatever the file already holds. */
export const IGNORE_ENTRIES = ['.ambicode/reviews/'];
