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
  authoring: {
    editReminders: true,
  },
} as const;

/** Bounded capture for any single command; larger output is truncated with a notice. */
export const MAX_COMMAND_OUTPUT_BYTES = 262_144;

/**
 * Bound on a requirement envelope piped in with `--evidence -`. Generous
 * against `review.maxContextBytes`, which is what actually decides whether
 * the retrieved content fits: this only stops an unbounded read, and an
 * envelope over it is refused rather than truncated, because half an
 * envelope is not evidence.
 */
export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;

/**
 * Snapshot budgets. These bound what is written to disk for the reviewer to
 * read; `review.maxContextBytes` separately bounds the prompt itself, so the
 * two are not interchangeable.
 */
export const MAX_SNAPSHOT_FILE_BYTES = 262_144;
export const MAX_SNAPSHOT_TOTAL_BYTES = 4 * 1024 * 1024;

/**
 * Prior merge request discussion shown to the reviewer as untrusted evidence.
 * Bounded so a long-running merge request cannot crowd the change out of the
 * context; whatever is left out is reported as an omission (doc 03 P1.5).
 */
export const MAX_REVIEWED_DISCUSSIONS = 50;
export const MAX_DISCUSSION_CONTEXT_BYTES = 32_768;
/** Comments longer than this are shown with their tail marked as omitted. */
export const MAX_DISCUSSION_NOTE_BYTES = 2_048;

/**
 * Headroom kept when deciding how much unchanged sibling context fits. The
 * prompt's check and omission sections are written after the snapshot is
 * planned, so the budget reserves room for them rather than discovering the
 * overrun at the final measurement.
 */
export const PROMPT_EVIDENCE_RESERVE_BYTES = 16_384;

export const CONFIG_DIR = '.ambicode';
export const CONFIG_FILE = '.ambicode/config.yaml';
export const REVIEWS_DIR = '.ambicode/reviews';
export const PROJECT_POLICIES_DIR = '.ambicode/policies';
/** Optional investigation/task/plan notes (doc 02, "Storage and ownership"); local, never versioned. */
export const NOTES_DIR = '.ambicode/notes';

/** Entries first-run setup may add, preserving whatever the file already holds. */
export const IGNORE_ENTRIES = ['.ambicode/reviews/', '.ambicode/notes/'];
