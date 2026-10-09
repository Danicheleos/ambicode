import { changeLines, filesSection } from './change-lines.ts';

export const SHAPE_MAX_LINES = 8;
export const SHAPE_MAX_BYTES = 600;

/** One change decision per Files line: a hedge means the model left the file undecided. */
const HEDGE = /\b(?:only if|possibly|may need|might|did not read|not read|if needed|optional)\b/i;
// A file the answer proposes to create has nothing to read. Wording only: "(new method)" on an existing file does not match.
const CREATION = /\b(?:new files?|creat(?:e|es|ed|ion|ing)|would be new|is new)\b|\(new\)|(?:^|[\s(])new\s*[:—–-]|\bnew\s*$/i;
/** The one vocabulary a change line uses to name the file it was inferred from: `<path> — inferred from <read path>`. */
export const INFERENCE_MARKERS: readonly string[] = ['inferred from', 'by analogy with', 'mirrors', 'same change as'];
// The basis is the first path after a marker. Campaign 2: be-vs-5973 recall fell .786 -> .579 when unread
// sibling files inferred from one read feature were blocked, so a named, read basis is a decision.
const INFERENCE = new RegExp(`(?:${INFERENCE_MARKERS.join('|')})\\s+[\`'"(*]*(\\/?(?:[\\w@.+-]+\\/)+[\\w@.+-]+\\.[A-Za-z0-9]+)`, 'i');
// Same token the eval scorer reads (PATH_TOKEN in bench-score.mjs): a slash, an extension, a delimiter before it.
const PATH_TOKEN = /(?:^|[\s`'"(\[*|])(\/?(?:[\w@.+-]+\/)+[\w@.+-]+\.[A-Za-z0-9]+)/g;
const BULLET = /^( *)(?:[-*+]|\d+[.)])\s+/;

export interface AnswerShapeInput {
  answer: string;
  /** Names of this route's `read` receipts: `path` or `path:from-to`. */
  served: readonly string[];
  /** Paths the caller knows to be new; a change line that says "new" is exempt as well. */
  created?: readonly string[];
  /** Default true. False restores the exact-file rule; only the offline replay turns it off, to count what the stem rule removes. */
  companions?: boolean;
}

export interface AnswerShape { notRead: string[]; basisNotRead: { path: string; basis: string }[]; undecided: string[] }

const clean = (found: string): string => found.replace(/^(?:.*\/)?repo\//, '').replace(/^\.\//, '');
const spanless = (name: string): string => name.replace(/:\d+(?:[-:]\d*)?$/, '');
const pathsOf = (text: string): string[] => [...new Set([...text.matchAll(PATH_TOKEN)].map((match) => clean(match[1] ?? '')))];
/** `controllers/x.ts` for `src/controllers/x.ts`: a path written without its leading directories is the same file. */
const same = (a: string, b: string): boolean => a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);

/**
 * Same directory and same stem (the basename up to its first dot): `x.controller.spec.ts` and `x.controller.ts`,
 * `x.component.html` and `x.component.ts`, `a.test.js` and `a.js`. No suffix list, so it holds in any language.
 * Campaign 1 (be-vs-6140): R1 flagged niosh.controller.spec.ts after niosh.controller.ts was read, in most blocked runs.
 */
export function companion(a: string, b: string): boolean {
  const stemmed = (p: string): string => {
    const slash = p.lastIndexOf('/');
    const base = p.slice(slash + 1);
    const dot = base.indexOf('.', 1);
    return p.slice(0, slash + 1) + (dot < 0 ? base : base.slice(0, dot));
  };
  return same(stemmed(a), stemmed(b));
}

/** A change entry is a line plus the indented lines under it; a hedge anywhere in it leaves the entry's file undecided. */
function entries(change: string): string[][] {
  const out: string[][] = [];
  for (const line of change.split('\n')) {
    const bullet = BULLET.exec(line);
    const nested = /^\s/.test(line) && !line.startsWith('|') && (bullet === null || (bullet[1]?.length ?? 0) > 1);
    const last = out.at(-1);
    if (nested && last !== undefined) last.push(line);
    else out.push([line]);
  }
  return out;
}

/** Every path on a change line of `## Files`, as the scorer reads them: the candidates the caller may test for existence. */
export function changePathsOf(answer: string): string[] {
  const section = filesSection(answer);
  return section === null ? [] : pathsOf(changeLines(section).change);
}

/** The basis of an inference stated for `file` on any line of the answer: the line names the file, a marker and a basis path. */
function proseBasis(lines: readonly { paths: string[]; basis: string }[], file: string): string | undefined {
  return lines.find((line) => line.paths.some((p) => same(p, file)) && !same(line.basis, file))?.basis;
}

export function answerShape(input: AnswerShapeInput): AnswerShape {
  const section = filesSection(input.answer);
  // Campaign 3 (be-vs-5973 e-Sjy7wr): the model wrote "inferred from" in the role prose and left the Files bullets bare.
  const marked = input.answer.split('\n').flatMap((line) => {
    const basis = INFERENCE.exec(line)?.[1];
    return basis === undefined ? [] : [{ paths: pathsOf(line), basis: clean(basis) }];
  });
  const notRead: string[] = [];
  const basisNotRead: { path: string; basis: string }[] = [];
  const undecided: string[] = [];
  const changePaths: string[] = [];
  if (section !== null) {
    const servedPaths = input.served.map(spanless);
    for (const entry of entries(changeLines(section).change)) {
      const head = pathsOf(entry[0] ?? '');
      const text = entry.join('\n');
      const ownBasis = INFERENCE.exec(text)?.[1];
      const basis = ownBasis;
      const named = head.length > 0 ? head : pathsOf(text);
      // The basis is evidence on this line, not a change of its own.
      const basisless = basis === undefined ? named : named.filter((p) => !same(p, clean(basis)));
      const paths = basisless.length > 0 ? basisless : named;
      for (const found of pathsOf(text)) if (!changePaths.includes(found)) changePaths.push(found);
      const creation = CREATION.test(entry[0] ?? '');
      for (const file of paths) {
        if (HEDGE.test(text) && !undecided.includes(file)) undecided.push(file);
        const made = creation || (input.created ?? []).some((c) => same(c, file));
        const covered = (target: string): boolean => servedPaths.some((s) => same(s, target) || (input.companions !== false && companion(s, target)));
        if (made || covered(file)) continue;
        const based = basis !== undefined && !same(clean(basis), file) ? clean(basis) : proseBasis(marked, file);
        if (based !== undefined) {
          if (!covered(based) && !basisNotRead.some((b) => b.path === file)) basisNotRead.push({ path: file, basis: based });
        } else if (!notRead.includes(file)) notRead.push(file);
      }
    }
  }
  return { notRead, basisNotRead, undecided };
}

/**
 * The lines a Stop block lists, rule 1 first so the byte cap drops the weaker rule. Nothing for an
 * answer with no `## Files` section: there are no decisions to check.
 */
export function answerShapeProblems(input: AnswerShapeInput): string[] {
  const shape = answerShape(input);
  const all = [...shape.notRead.map((p) => `not read: ${p}`), ...shape.basisNotRead.map((b) => `basis not read: ${b.path} \u2190 ${b.basis}`), ...shape.undecided.map((p) => `undecided: ${p}`)];
  const out: string[] = [];
  let bytes = 0;
  for (const line of all) {
    bytes += Buffer.byteLength(line) + 1;
    if (out.length >= SHAPE_MAX_LINES || bytes > SHAPE_MAX_BYTES) break;
    out.push(line);
  }
  return out;
}
