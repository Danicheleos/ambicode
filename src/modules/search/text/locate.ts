import { TEST_EXCLUDES } from '#types/defaults';
import type { ProjectConfig, ShortlistConfig } from '#types/modules/config';
import { SCORE_FILENAME, type LocateShortlist } from '#types/modules/search';
import type { RequirementSource } from '#types/modules/requirements';
import { literalPathspec, type Git } from '#platform/git/git';
import { pathExclusionReason } from '#modules/review/snapshot/exclusions';
import { matchesAnyGlob, matchesGlob } from '#util/glob';
import { normalizeRelative, toProjectRelative } from '#util/paths';
import { profileOf, sourceGlob } from '../declarations/profile.ts';

/**
 * Every signal is computed per call from git, with no index or cache, so the
 * shortlist cannot go stale. When it finds nothing it returns nothing; it never
 * widens into "here is the whole project".
 */

/** Terms beyond this are dropped: an unbounded term list is an unbounded scan. */
const MAX_TERMS = 12;

/** Shorter than this matches too much of any codebase to mean anything. */
const MIN_TERM_LENGTH = 3;

const MAX_CONTENT_MATCHES_PER_TERM = 200;

const MAX_COCHANGE_COMMITS = 200;

/** Fewer than this and co-change is coincidence, not habit. */
const MIN_COCHANGE_COMMITS = 2;

const MIN_COCHANGE_SHARE = 0.25;
const MIN_COCHANGE_COUNT = 2;

/** A sweeping commit (reformat, licence header, initial import) says nothing about boundaries. */
const MAX_COCHANGE_COMMIT_FILES = 50;

/**
 * A seed moving in lockstep with more files than this belongs to a block
 * maintained together (locale family, generated client), so its companions are dropped.
 */
const MAX_COCHANGE_PARTNERS = 6;

/** The already-matched files co-change is measured against. */
const MAX_SEEDS = 5;

/** Scores only order one call's list; a content mention is weakest because a word can appear in any comment. */
const SCORE_DIRECTORY = 5;
const SCORE_CONTENT = 2;
/** Scaled by the share of the seed's commits, so a habit outranks an accident. */
const SCORE_COCHANGE = 4;

/**
 * Diminishing returns: the total approaches `2 * SCORE_CONTENT`, below
 * `SCORE_DIRECTORY` by construction, so saying the words often never beats naming the boundary.
 */
function contentScore(hits: number): number {
  return hits <= 0 ? 0 : SCORE_CONTENT * (2 - 2 ** (1 - hits));
}

interface LocateRequest {
  git: Git;
  project: ProjectConfig;
  terms: readonly string[];
  limit: number;
}

interface Ranked {
  path: string;
  /** Path and co-change score, which accumulate without a ceiling. */
  score: number;
  /** Counted rather than summed, because `contentScore` is not linear. */
  contentHits: number;
  reasons: string[];
}

export async function locate(request: LocateRequest): Promise<LocateShortlist> {
  const limitations: string[] = [];
  const terms = normalizeTerms(request.terms, limitations);
  if (terms.length === 0) {
    return { terms: [], candidates: [], limitations: [...limitations, 'No usable search term was supplied.'] };
  }

  const projectRoot = normalizeRelative(request.project.root);
  const pathspec = projectRoot === '' ? null : literalPathspec(projectRoot);
  const files = (await request.git.listFiles(pathspec)).filter(
    (candidate) => toProjectRelative(projectRoot, candidate) !== null && pathExclusionReason(candidate) === null,
  );
  if (files.length === 0) {
    return {
      terms,
      candidates: [],
      limitations: [...limitations, `Project "${request.project.id}" holds no reviewable files to search.`],
    };
  }

  const fileSet = new Set(files);
  const ranked = new Map<string, Ranked>();

  for (const term of terms) {
    const matchedPaths = pathMatches(term, files, limitations);
    const matchedContents = await contentMatches(request, term, pathspec, fileSet, limitations);

    const touched = new Set([
      ...matchedPaths.map((match) => match.path),
      ...matchedContents.map((match) => match.path),
    ]);
    if (isTooBroad(touched.size, files.length)) {
      limitations.push(
        `"${term}" matched ${touched.size} of the project's ${files.length} files, which is not a shortlist, so it was ignored.`,
      );
      continue;
    }
    if (touched.size === 0) {
      limitations.push(`No file's path or contents matched "${term}".`);
      continue;
    }

    const weight = specificity(touched.size, files.length);
    for (const match of matchedPaths) {
      add(ranked, match.path, weight * (match.kind === 'directory' ? SCORE_DIRECTORY : SCORE_FILENAME), match.reason);
    }
    for (const match of matchedContents) {
      mention(ranked, match.path, match.reason, weight);
    }
  }

  await addCoChange(request, ranked, fileSet, limitations);

  const scored = [...ranked.values()]
    .map((entry) => ({ ...entry, score: entry.score + contentScore(entry.contentHits) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  // Filtered after scoring so a test still seeds co-change toward the code it covers.
  const rules = shortlistRules(request.project);
  const listable = (file: string): boolean => shortlistable(toProjectRelative(projectRoot, file) ?? file, rules);
  const ordered = withCompanions(scored, fileSet, listable, profileOf(request.project).companions).filter((entry) => listable(entry.path));
  if (ordered.length < scored.length) {
    limitations.push(
      `${scored.length - ordered.length} matching file(s) are not listed: they fall outside projects[].shortlist in .ambicode/config.yaml (tests, styles, markup and data by default).`,
    );
  }
  if (ordered.length > request.limit) {
    limitations.push(
      `${ordered.length - request.limit} further candidate(s) scored but are not listed; raise --limit to see them.`,
    );
  }

  return {
    terms,
    candidates: ordered.slice(0, request.limit).map((entry) => ({
      path: entry.path,
      score: Math.round(entry.score * 100) / 100,
      reasons: entry.reasons,
    })),
    limitations,
  };
}

/** A filtered companion (`[from, to]` in the profile) hands its score to the same-name `to` file (`x.component.html` → `x.component.ts`), max-merged. */
function withCompanions<T extends { path: string; score: number; reasons: string[] }>(scored: readonly T[], files: ReadonlySet<string>, listable: (file: string) => boolean, companions: readonly (readonly [string, string])[]): T[] {
  const byPath = new Map(scored.map((entry) => [entry.path, { ...entry, reasons: [...entry.reasons] }]));
  for (const entry of scored) {
    if (listable(entry.path)) continue;
    for (const [from, to] of companions) {
      if (!entry.path.toLowerCase().endsWith(`.${from}`)) continue;
      const source = `${entry.path.slice(0, -from.length)}${to}`;
      if (!files.has(source) || !listable(source)) continue;
      const reason = `its template ${entry.reasons[0] ?? 'matches'}`;
      const { score } = entry;
      const target = byPath.get(source);
      if (target === undefined) byPath.set(source, { ...entry, path: source, score, reasons: [reason] });
      else if (score > target.score) Object.assign(target, { score, reasons: [...target.reasons, reason] });
      else if (!target.reasons.includes(reason)) target.reasons.push(reason);
    }
  }
  return [...byPath.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

/** Without a configured shortlist: the profile's source extensions, and every test convention excluded. */
export function shortlistRules(project: ProjectConfig): ShortlistConfig {
  return project.shortlist ?? { include: [sourceGlob(profileOf(project).sources)], exclude: [...TEST_EXCLUDES] };
}

function shortlistable(projectRelativePath: string, rules: ShortlistConfig): boolean {
  return (rules.include.length === 0 || matchesAnyGlob(projectRelativePath, rules.include)) && !matchesAnyGlob(projectRelativePath, rules.exclude);
}

/**
 * `Order/Refund`, `order-refund`, `orderRefund` and `ORDER_REFUND` all reduce to
 * the same lowercased word list, which the spellings below are built from.
 */
function wordsOf(term: string): string[] {
  return term
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '')
    .map((word) => word.toLowerCase());
}

/**
 * Between digits the separator is arithmetic: "250.5" joined to "2505" would
 * match `41.2505` in SVG path data, so an all-digit term keeps its own spelling.
 */
function joinable(words: readonly string[]): boolean {
  return words.length > 1 && words.some((word) => !/^\p{N}+$/u.test(word));
}

/**
 * The term's own spelling first, so its reason is the one reported. Joined forms
 * are letters and digits only, so a term carrying glob syntax still contributes.
 */
function pathForms(term: string): string[] {
  const words = wordsOf(term);
  const literal = term.toLowerCase();
  const forms = /^[^*?[\]{}()!\\]+$/.test(literal) ? [literal] : [];
  if (joinable(words)) forms.push(words.join('-'), words.join('_'), words.join(''));
  // `e.g` joins to `eg`, which sits inside `strategy`: a joined form shorter than a term is noise.
  return [...new Set(forms)].filter((form) => form === literal || form.length >= MIN_TERM_LENGTH);
}

/** `refundlimit` finds `refundLimit` and `REFUND_LIMIT` alike; two greps per term is the whole budget. */
function compactForm(term: string): string {
  const words = wordsOf(term);
  return joinable(words) ? words.join('') : term.toLowerCase();
}

const PATH_REASON = /^(?:sits under a directory matching|filename matched) /;
/** A reason `locate` gives for a path match, as opposed to a content or co-change one. */
export const isPathReason = (reason: string): boolean => PATH_REASON.test(reason);

/**
 * Equivalent to `**\/*form*\/**` then `**\/*form*` (a dot segment defeats both), but
 * as substring tests because `matchesGlob` compiles its pattern on every call.
 * A spelling holding `/` spans segments, and keeps the glob.
 */
export function pathHit(lowerPath: string, form: string): 'directory' | 'filename' | null {
  if (form.includes('/')) {
    if (matchesGlob(lowerPath, `**/*${form}*/**`)) return 'directory';
    return matchesGlob(lowerPath, `**/*${form}*`) ? 'filename' : null;
  }
  const segments = lowerPath.split('/');
  if (segments.some((segment) => segment.startsWith('.'))) return null;
  const last = segments.length - 1;
  for (let index = 0; index < last; index += 1) {
    if (segments[index]?.includes(form) === true) return 'directory';
  }
  return segments[last]?.includes(form) === true ? 'filename' : null;
}

/**
 * git reports POSIX paths on every platform, so Windows compares the same strings.
 * Each file takes its strongest single spelling and is never counted twice.
 */
function pathMatches(
  term: string,
  files: readonly string[],
  limitations: string[],
): { path: string; kind: 'directory' | 'filename'; reason: string }[] {
  const forms = pathForms(term);
  if (forms.length === 0) {
    limitations.push(`"${term}" carries glob syntax, so it was matched against file contents only.`);
    return [];
  }

  const matches = new Map<string, { path: string; kind: 'directory' | 'filename'; reason: string }>();
  for (const form of forms) {
    const spelling =
      form === term.toLowerCase() ? `"${term}"` : `"${form}", a path spelling of "${term}"`;
    for (const file of files) {
      const hit = pathHit(file.toLowerCase(), form);
      if (hit === null) continue;
      const directory = hit === 'directory';
      if (matches.get(file)?.kind === 'directory') continue;
      matches.set(file, {
        path: file,
        kind: directory ? 'directory' : 'filename',
        reason: directory
          ? `sits under a directory matching ${spelling}`
          : `filename matched ${spelling}`,
      });
    }
  }
  if (matches.size === 0) {
    for (const segment of routeSegments(term)) {
      for (const file of files) {
        if (pathHit(file.toLowerCase(), segment) === 'filename' && !matches.has(file)) matches.set(file, { path: file, kind: 'filename', reason: `filename matched "${segment}", a segment of "${term}"` });
      }
    }
  }
  return broadDirectories([...matches.values()], forms);
}

/** `orders/v1/{id}` names no file, but its plain segments (`orders`) may: version and parameter segments are dropped. */
function routeSegments(term: string): string[] {
  if (!term.includes('/')) return [];
  return term.toLowerCase().split('/').filter((segment) => segment.length >= MIN_TERM_LENGTH && /^[a-z][a-z0-9_-]*$/.test(segment) && !/^v\d+$/.test(segment));
}

const BROAD_PLACES = 3;

/**
 * A term spelled by several unrelated directories (`employee/` in three places) does not say where the request lives:
 * its hits keep their score, not a path reason.
 */
function broadDirectories(matches: { path: string; kind: 'directory' | 'filename'; reason: string }[], forms: readonly string[]): typeof matches {
  const roots = new Set<string>();
  for (const match of matches) {
    if (match.kind !== 'directory') continue;
    const segments = match.path.toLowerCase().split('/');
    const at = segments.findIndex((segment, index) => index < segments.length - 1 && forms.some((form) => segment.includes(form)));
    if (at < 0) continue;
    roots.add(segments.slice(0, at + 1).join('/'));
  }
  if (roots.size < BROAD_PLACES) return matches;
  return matches.map((match) => (match.kind === 'directory' ? { ...match, reason: match.reason.replace('sits under a directory matching', `sits under one of ${roots.size} broad directories matching`) } : match));
}

/** A file holding both the term and its compact form is one mention, not two. */
async function contentMatches(
  request: LocateRequest,
  term: string,
  pathspec: string | null,
  fileSet: ReadonlySet<string>,
  limitations: string[],
): Promise<{ path: string; reason: string }[]> {
  const compact = compactForm(term);
  const spellings = [{ needle: term, reason: `contains "${term}"` }];
  if (compact !== term.toLowerCase() && compact.length >= MIN_TERM_LENGTH) {
    spellings.push({
      needle: compact,
      reason: `contains "${compact}", a compact spelling of "${term}"`,
    });
  }

  const matches = new Map<string, { path: string; reason: string }>();
  for (const spelling of spellings) {
    let found = (await request.git.grepFiles(spelling.needle, pathspec)).filter((path) =>
      fileSet.has(path),
    );
    if (found.length > MAX_CONTENT_MATCHES_PER_TERM) {
      limitations.push(
        `"${spelling.needle}" appears in ${found.length} files; only the first ${MAX_CONTENT_MATCHES_PER_TERM} were ranked.`,
      );
      found = found.slice(0, MAX_CONTENT_MATCHES_PER_TERM);
    }
    for (const path of found) {
      if (matches.has(path)) continue;
      matches.set(path, { path, reason: spelling.reason });
    }
  }
  return [...matches.values()];
}

/**
 * Finds files that habitually move with the matched ones but carry none of the
 * terms. Two git invocations whatever the number of seeds.
 */
async function addCoChange(
  request: LocateRequest,
  ranked: Map<string, Ranked>,
  fileSet: ReadonlySet<string>,
  limitations: string[],
): Promise<void> {
  const seeds = [...ranked.values()]
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, MAX_SEEDS)
    .map((entry) => entry.path);
  if (seeds.length === 0) return;

  const commits = await request.git.commitsTouching(seeds.map(literalPathspec), MAX_COCHANGE_COMMITS);
  if (commits.length < MIN_COCHANGE_COMMITS) {
    limitations.push(
      `Co-change contributed nothing: ${commits.length} commit(s) in this repository touch the files the terms matched.`,
    );
    return;
  }

  const lists = await request.git.commitFileLists(commits);
  const usable = lists.filter((entry) => entry.paths.length <= MAX_COCHANGE_COMMIT_FILES);
  if (usable.length < lists.length) {
    limitations.push(
      `${lists.length - usable.length} of ${lists.length} commit(s) changed more than ${MAX_COCHANGE_COMMIT_FILES} files and were not used for co-change.`,
    );
  }
  if (usable.length < MIN_COCHANGE_COMMITS) return;

  // The strongest single companionship, not the sum: summing would let a file
  // accompanying four seeds outrank the file the terms actually named.
  const best = new Map<string, { share: number; reason: string }>();
  const blocked: string[] = [];

  for (const seed of seeds) {
    const withSeed = usable.filter((entry) => entry.paths.includes(seed));
    if (withSeed.length < MIN_COCHANGE_COMMITS) continue;

    const counts = new Map<string, number>();
    for (const entry of withSeed) {
      for (const path of entry.paths) {
        if (path === seed || !fileSet.has(path)) continue;
        counts.set(path, (counts.get(path) ?? 0) + 1);
      }
    }

    const companions = [...counts]
      .filter(([, count]) => count >= MIN_COCHANGE_COUNT && count / withSeed.length >= MIN_COCHANGE_SHARE);
    if (companions.length > MAX_COCHANGE_PARTNERS) {
      blocked.push(`${seed} (${companions.length})`);
      continue;
    }

    for (const [path, count] of companions) {
      const share = count / withSeed.length;
      const existing = best.get(path);
      if (existing !== undefined && existing.share >= share) continue;
      best.set(path, {
        share,
        reason: `changed with ${seed} in ${count} of ${withSeed.length} commits`,
      });
    }
  }

  if (blocked.length > 0) {
    limitations.push(
      `Co-change contributed nothing for ${blocked.join(", ")}: each moves with more than ${MAX_COCHANGE_PARTNERS} other files, which is a set maintained as a block rather than a boundary.`,
    );
  }

  for (const [path, entry] of best) {
    add(ranked, path, SCORE_COCHANGE * entry.share, entry.reason);
  }
}

function add(ranked: Map<string, Ranked>, path: string, score: number, reason: string): void {
  entryFor(ranked, path).score += score;
  note(ranked, path, reason);
}

function mention(ranked: Map<string, Ranked>, path: string, reason: string, weight: number): void {
  entryFor(ranked, path).contentHits += weight;
  note(ranked, path, reason);
}

function entryFor(ranked: Map<string, Ranked>, path: string): Ranked {
  const existing = ranked.get(path);
  if (existing !== undefined) return existing;
  const created: Ranked = { path, score: 0, contentHits: 0, reasons: [] };
  ranked.set(path, created);
  return created;
}

function note(ranked: Map<string, Ranked>, path: string, reason: string): void {
  const entry = entryFor(ranked, path);
  if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
}

/**
 * A term reaching most of the project (`src`, the company name) describes the
 * project, not a boundary. The floor keeps tiny projects out of the rule.
 */
const TOO_BROAD_SHARE = 0.6;
const TOO_BROAD_MIN_FILES = 5;

/** 1 for a term naming one file, toward 0 as it reaches the whole project: a rare term says more about the boundary. */
function specificity(matched: number, total: number): number {
  return total <= 1 ? 1 : Math.max(0, Math.log(total / Math.max(1, matched)) / Math.log(total));
}

export function isTooBroad(matched: number, total: number): boolean {
  return matched >= TOO_BROAD_MIN_FILES && matched > total * TOO_BROAD_SHARE;
}

function normalizeTerms(supplied: readonly string[], limitations: string[]): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  const tooShort: string[] = [];

  for (const raw of supplied) {
    const term = raw.trim();
    if (term === '') continue;
    if (term.length < MIN_TERM_LENGTH) {
      tooShort.push(term);
      continue;
    }
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }

  if (tooShort.length > 0) {
    limitations.push(
      `Ignored term(s) shorter than ${MIN_TERM_LENGTH} characters: ${[...new Set(tooShort)].join(', ')}.`,
    );
  }
  if (terms.length > MAX_TERMS) {
    limitations.push(
      `Only the first ${MAX_TERMS} terms were searched; ${terms.length - MAX_TERMS} were dropped.`,
    );
    return terms.slice(0, MAX_TERMS);
  }
  return terms;
}

/** A word-frequency heuristic; identifier-shaped tokens rank first, because naming code names the boundary. */
export function termsFromRequirements(
  sources: readonly Pick<RequirementSource, 'title' | 'content'>[],
  limit = MAX_TERMS,
): string[] {
  const found = new Map<string, { term: string; count: number; order: number; identifier: boolean }>();
  let order = 0;

  for (const source of sources) {
    for (const token of tokenize(`${source.title}\n${source.content}`)) {
      const key = token.toLowerCase();
      const existing = found.get(key);
      if (existing !== undefined) {
        existing.count += 1;
        continue;
      }
      found.set(key, { term: token, count: 1, order: (order += 1), identifier: isIdentifierLike(token) });
    }
  }

  return [...found.values()]
    .sort(
      (a, b) =>
        Number(b.identifier) - Number(a.identifier) || b.count - a.count || a.order - b.order,
    )
    .slice(0, limit)
    .map((entry) => entry.term);
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const raw of text.split(/[^\p{L}\p{N}_./-]+/u)) {
    const token = raw.replace(/^[./-]+/, '').replace(/[./-]+$/, '');
    if (token.length < MIN_TERM_LENGTH) continue;
    if (/^\p{N}+$/u.test(token)) continue;
    if (isIdentifierLike(token)) {
      tokens.push(token);
      // `MO-REBA-11` names the REBA module and `manuallyOverriddenCvValues` the override code: the parts are what paths carry.
      for (const word of wordsOf(token)) {
        if (word.length >= 4 && !/^\p{N}+$/u.test(word) && !STOPWORDS.has(word)) tokens.push(word);
      }
      continue;
    }
    if (token.length < 4 || STOPWORDS.has(token.toLowerCase())) continue;
    tokens.push(token);
  }
  return tokens;
}

/** `order_total`, `InvoiceService`, `src/orders`, `tax.rate` — but not `Order`. */
function isIdentifierLike(token: string): boolean {
  return /[_./-]/.test(token) || /\p{Ll}\p{Lu}/u.test(token);
}

/** Deliberately short: the breadth guard stops useless terms; this only saves a grep on "should". */
const STOPWORDS = new Set([
  'about', 'after', 'also', 'always', 'another', 'because', 'been', 'before', 'being', 'both',
  'cannot', 'could', 'description', 'does', 'done', 'each', 'either', 'else', 'every', 'from',
  'given', 'have', 'here', 'however', 'into', 'issue', 'it’s', 'just', 'like', 'made', 'make',
  'many', 'more', 'most', 'must', 'need', 'needs', 'never', 'none', 'only', 'other', 'over',
  'page', 'part', 'please', 'rather', 'same', 'shall', 'should', 'since', 'some', 'stop', 'such',
  'summary', 'sure', 'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they', 'this',
  'those', 'through', 'ticket', 'time', 'under', 'until', 'upon', 'used', 'user', 'using', 'very',
  'want', 'were', 'what', 'when', 'where', 'which', 'while', 'will', 'with', 'within', 'without',
  'work', 'would', 'your',
]);
