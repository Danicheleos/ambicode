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
    /** Written out empty so the key is discoverable before it is needed. */
    excludePaths: [] as string[],
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
/**
 * Where a merge-request review is saved. A merge request is somebody else's
 * branch: there is no local task it belongs beside, so it keeps its own home.
 */
export const REVIEWS_DIR = '.ambicode/reviews';

/**
 * One directory per task, holding everything about that task: the plan, any
 * investigation, and the reviews of the work. Answering "what happened on
 * ORD-17" used to mean three listings — `notes/plans/`,
 * `notes/investigations/` and `reviews/` — and a name match in each, because
 * the only thing tying them together was a ticket id repeated in three
 * filenames. The directory is the grouping now, so the ticket is spelled
 * once and the listing is the index.
 */
export const TASKS_DIR = '.ambicode/task';

/** The reviews of one task, inside its own directory. */
export const REVIEWS_LEAF = 'reviews';
export const PROJECT_POLICIES_DIR = '.ambicode/policies';
/**
 * The old home of investigation, task and plan notes. Nothing writes here any
 * more — those live in `TASKS_DIR` beside the reviews of the same work — but
 * the ignore entry stays so a repository that still holds one keeps it out of
 * history.
 */
const LEGACY_NOTES_DIR = '.ambicode/notes/';

/** Entries first-run setup may add, preserving whatever the file already holds. */
export const IGNORE_ENTRIES = ['.ambicode/reviews/', LEGACY_NOTES_DIR, '.ambicode/task/'];
