/** The route's layer lists for each search mode. */
export const SEARCH_LAYER_DEFAULTS = {
  prompt: ['shortlist', 'harvest', 'shortlist'],
  context: ['grep', 'harvest'],
} as const;


export const MAX_COMMAND_OUTPUT_BYTES = 262_144;

/**
 * Only stops an unbounded `--evidence -` read; `review.maxContextBytes` decides fit.
 * An envelope over it is refused, not truncated: half an envelope is not evidence.
 */
export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;

export const MAX_SNAPSHOT_FILE_BYTES = 262_144;

export const AMBICODE_DIR = '.ambicode';
export const CONFIG_FILE = `${AMBICODE_DIR}/config.yaml`;
export const TASKS_DIR = `${AMBICODE_DIR}/tasks`;
export const REVIEWS_DIR = `${AMBICODE_DIR}/reviews`;
export const CONTEXT_DIR = `${AMBICODE_DIR}/context`;

/** Review runs live apart from the other runs; everything else is a task directory. */
export type DirKind = 'task' | 'review';
export const dirKindFor = (skill: string): DirKind => (skill === 'review' ? 'review' : 'task');
