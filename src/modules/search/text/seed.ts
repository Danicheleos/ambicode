const PATH_LIKE = /(?<![\w./-])((?:\.{0,2}\/)?[\w@.-]+(?:\/[\w@.-]+)+)(?::\d+(?:-\d+)?)?/g;
export const CODE_SHAPED = /`([^`\s]{2,80})`|\b([A-Za-z_$][\w$]*(?:[a-z0-9][A-Z]|_[A-Za-z0-9])[\w$]*)\b/g;
const MAX_SEEDS = 12;
/** A path, or a file name with a short lowercase extension: not a symbol. */
const FILE_LIKE = /\/|^[\w@-]+(?:\.[\w-]+)*\.[a-z]{1,5}$/;

/** Tracked files the text cites by path (an optional `:line` is dropped); a cited path that is not tracked seeds nothing. */
export function pathsCitedIn(text: string, files: readonly string[]): string[] {
  const tracked = new Set(files);
  const cited = [...text.matchAll(PATH_LIKE)].map((match) => match[1]!.replace(/^\.\//, '').replace(/[.,;:]+$/, ''));
  return [...new Set(cited.filter((file) => tracked.has(file)))].slice(0, MAX_SEEDS);
}

/** Backticked or code-shaped names (camelCase, snake_case); a dotted name keeps its last segment. */
export function symbolsCitedIn(text: string): string[] {
  const tokens = [...text.matchAll(CODE_SHAPED)].map((match) => match[1] ?? match[2] ?? '').filter((token) => !FILE_LIKE.test(token));
  const names = tokens.map((token) => token.replace(/\(\)$/, '').split('.').at(-1) ?? '');
  return [...new Set(names.filter((name) => /^[A-Za-z_$][\w$]{2,}$/.test(name)))].slice(0, MAX_SEEDS);
}
