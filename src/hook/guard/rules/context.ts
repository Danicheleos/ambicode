// Serves every skill: .ambicode/context is written only by `ambicode context write`.
export const CONTEXT_DIR = /(?:^|\/)\.ambicode\/context(?:\/|$)/;

export const CONTEXT_REASON =
  'AMBICODE: .ambicode/context/ is written only through `ambicode context write`, which enforces the size limits and refuses duplicates; use `ambicode context write`.';
