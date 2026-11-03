// Serves every skill: .ambicode/context holds only the search index (search/folders.jsonl), which `ambicode` builds from git and rebuilds when HEAD changes.
export const CONTEXT_DIR = /(?:^|\/)\.ambicode\/context(?:\/|$)/;

export const CONTEXT_REASON =
  'AMBICODE: .ambicode/context/ holds the search index, which ambicode builds from git and rebuilds itself when HEAD changes; a hand edit is overwritten or leaves the map wrong. Do not write there.';
