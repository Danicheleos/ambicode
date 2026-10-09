import { changeLines, filesSection } from './change-lines.ts';

export const SHAPE_MAX_LINES = 8;
export const SHAPE_MAX_BYTES = 600;

/** One change decision per Files line: a hedge means the model left the file undecided. */
const HEDGE = /\b(?:only if|possibly|may need|might|did not read|not read|if needed|optional)\b/i;
// A file the answer proposes to create has nothing to read. Wording only: "(new method)" on an existing file does not match.
const CREATION = /\b(?:new files?|creat(?:e|es|ed|ion|ing)|would be new|is new)\b|\(new\)|(?:^|[\s(])new\s*[:—–-]|\bnew\s*$/i;
// Same token the eval scorer reads (PATH_TOKEN in bench-score.mjs): a slash, an extension, a delimiter before it.
const PATH_TOKEN = /(?:^|[\s`'"(\[*|])(\/?(?:[\w@.+-]+\/)+[\w@.+-]+\.[A-Za-z0-9]+)/g;
const BULLET = /^( *)(?:[-*+]|\d+[.)])\s+/;

export interface AnswerShapeInput {
  answer: string;
  /** Names of this route's `read` receipts: `path` or `path:from-to`. */
  served: readonly string[];
  /** Paths the caller knows to be new; a change line that says "new" is exempt as well. */
  created?: readonly string[];
}

export interface AnswerShape { notRead: string[]; undecided: string[] }

const clean = (found: string): string => found.replace(/^(?:.*\/)?repo\//, '').replace(/^\.\//, '');
const spanless = (name: string): string => name.replace(/:\d+(?:[-:]\d*)?$/, '');
const pathsOf = (text: string): string[] => [...new Set([...text.matchAll(PATH_TOKEN)].map((match) => clean(match[1] ?? '')))];
/** `controllers/x.ts` for `src/controllers/x.ts`: a path written without its leading directories is the same file. */
const same = (a: string, b: string): boolean => a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);

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

export function answerShape(input: AnswerShapeInput): AnswerShape {
  const section = filesSection(input.answer);
  const notRead: string[] = [];
  const undecided: string[] = [];
  const changePaths: string[] = [];
  if (section !== null) {
    const servedPaths = input.served.map(spanless);
    for (const entry of entries(changeLines(section).change)) {
      const head = pathsOf(entry[0] ?? '');
      const paths = head.length > 0 ? head : pathsOf(entry.join('\n'));
      const text = entry.join('\n');
      for (const found of pathsOf(text)) if (!changePaths.includes(found)) changePaths.push(found);
      const creation = CREATION.test(entry[0] ?? '');
      for (const file of paths) {
        if (HEDGE.test(text) && !undecided.includes(file)) undecided.push(file);
        const made = creation || (input.created ?? []).some((c) => same(c, file));
        if (!made && !servedPaths.some((s) => same(s, file)) && !notRead.includes(file)) notRead.push(file);
      }
    }
  }
  return { notRead, undecided };
}

/**
 * The lines a Stop block lists, rule 1 first so the byte cap drops the weaker rule. Nothing for an
 * answer with no `## Files` section: there are no decisions to check.
 */
export function answerShapeProblems(input: AnswerShapeInput): string[] {
  const shape = answerShape(input);
  const all = [...shape.notRead.map((p) => `not read: ${p}`), ...shape.undecided.map((p) => `undecided: ${p}`)];
  const out: string[] = [];
  let bytes = 0;
  for (const line of all) {
    bytes += Buffer.byteLength(line) + 1;
    if (out.length >= SHAPE_MAX_LINES || bytes > SHAPE_MAX_BYTES) break;
    out.push(line);
  }
  return out;
}
