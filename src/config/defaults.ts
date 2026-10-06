export const DEFAULTS = {
  schemaVersion: 3 as const,
  review: {
    model: 'sonnet',
    timeoutSeconds: 300,
    // null: no limit, so nothing refuses or voids; a repository config can still set one.
    maxFindings: null as number | null,
    maxChangedFiles: null as number | null,
    maxChangedLines: null as number | null,
    maxContextBytes: null as number | null,
    excludePaths: [] as string[],
    onInvalid: 'void' as 'void' | 'drop',
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
  requirements: {
    acceptanceField: null,
  },
} as const;

/**
 * What a shortlist never names: tests by any convention. Its includes are the profile's source extensions
 * (markup, styles, data and docs left out: on 116 tickets tests and stylesheets alone took 18% of the 15 slots).
 * Written into config.yaml by init so a repository can widen it (`**\/*.html`, `**\/*.sql`).
 */
export const TEST_EXCLUDES = [
  '**/*.{spec,test,cy,stories}.*',
  '**/*.d.ts',
  '**/test_*.py',
  '**/*_test.*',
  '**/conftest.py',
  '**/{__tests__,__mocks__,test,tests,e2e,cypress}/**',
] as const;

/** Used when `search.layers` names no list for the mode. */
export const SEARCH_LAYER_DEFAULTS = {
  prompt: ['shortlist', 'harvest', 'shortlist'],
  context: ['grep', 'harvest'],
} as const;

/** Used when `search.indexDriftFiles` is absent: an index stays fresh while at most this many project files differ from its commit. */
export const INDEX_DRIFT_FILES = 20;

export const MAX_COMMAND_OUTPUT_BYTES = 262_144;

/**
 * Only stops an unbounded `--evidence -` read; `review.maxContextBytes` decides fit.
 * An envelope over it is refused, not truncated: half an envelope is not evidence.
 */
export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;

export const MAX_SNAPSHOT_FILE_BYTES = 262_144;

/** Unchanged sibling context still has a budget when `review.maxContextBytes` sets no limit. */
export const UNLIMITED_CONTEXT_BUDGET_BYTES = 524_288;
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

export const INDEX_DIR = '.ambicode/index';

export const IGNORE_ENTRIES = ['.ambicode/reviews/', LEGACY_NOTES_DIR, '.ambicode/task/'];

/** Written to `.gitignore` by `init --apply` only: an ignored index directory is the consent `index build` checks. */
export const GITIGNORE_ENTRIES = [`${INDEX_DIR}/`, '.ambicode/metrics.jsonl', '.ambicode/reviews/', '.ambicode/task/', LEGACY_NOTES_DIR];
