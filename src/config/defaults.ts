export const DEFAULTS = {
  schemaVersion: 1 as const,
  review: {
    model: 'sonnet',
    timeoutSeconds: 300,
    maxFindings: 7,
    maxChangedFiles: 50,
    maxChangedLines: 2000,
    maxContextBytes: 524_288,
    excludePaths: [] as string[],
  },
  checks: {
    timeoutSeconds: 120,
    maxSelectedTestFiles: 20,
  },
  page: {
    idleTimeoutSeconds: 1800,
    /**
     * Fixed, so a new `ambicode view` replaces the previous page and an old tab can
     * learn it was disconnected. Below the ephemeral range (49152+) and away from
     * dev-server defaults (3000, 4200, 5173, 8080).
     */
    port: 45831,
  },
  remoteChecks: {
    image: null,
  },
  authoring: {
    editReminders: true,
  },
} as const;

export const MAX_COMMAND_OUTPUT_BYTES = 262_144;

/**
 * Only stops an unbounded `--evidence -` read; `review.maxContextBytes` decides fit.
 * An envelope over it is refused, not truncated: half an envelope is not evidence.
 */
export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;

export const MAX_SNAPSHOT_FILE_BYTES = 262_144;
export const MAX_SNAPSHOT_TOTAL_BYTES = 4 * 1024 * 1024;

export const MAX_REVIEWED_DISCUSSIONS = 50;
export const MAX_DISCUSSION_CONTEXT_BYTES = 32_768;
export const MAX_DISCUSSION_NOTE_BYTES = 2_048;

/** Room reserved for the check and omission sections, which are written after the snapshot is planned. */
export const PROMPT_EVIDENCE_RESERVE_BYTES = 16_384;

export const CONFIG_DIR = '.ambicode';
export const CONFIG_FILE = '.ambicode/config.yaml';
export const REVIEWS_DIR = '.ambicode/reviews';

export const TASKS_DIR = '.ambicode/task';

export const REVIEWS_LEAF = 'reviews';
export const PROJECT_POLICIES_DIR = '.ambicode/policies';
/** Nothing writes here; still ignored so a repository holding old notes keeps them out of git. */
const LEGACY_NOTES_DIR = '.ambicode/notes/';

export const IGNORE_ENTRIES = ['.ambicode/reviews/', LEGACY_NOTES_DIR, '.ambicode/task/'];
