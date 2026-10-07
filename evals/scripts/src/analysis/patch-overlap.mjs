// How much of a merged change a run's patch reproduces, from the two patches alone: files, hunks and new identifiers.
// Free and deterministic, so it is blind to a valid alternative implementation; the opt-in task judge covers that.

const ESCAPES = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };
/** A path as git prints it: `"…"` C-quoted (non-ASCII as octal UTF-8 bytes, `"`, `\\`, tab) when it needs it. */
function unquote(token) {
  if (!token.startsWith('"')) return token;
  const bytes = [];
  const body = token.slice(1, -1);
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== '\\') bytes.push(...Buffer.from(body[i]));
    else if (/[0-7]{3}/.test(body.slice(i + 1, i + 4))) (bytes.push(parseInt(body.slice(i + 1, i + 4), 8)), (i += 3));
    else (bytes.push(ESCAPES[body[i + 1]] ?? body.charCodeAt(i + 1)), (i += 1));
  }
  return Buffer.from(bytes).toString('utf8');
}

/** The old and new path of a `diff --git` header line; null when it cannot be read. */
function headerPaths(line) {
  const quoted = /^("(?:[^"\\]|\\.)*"|\S+) ("(?:[^"\\]|\\.)*"|\S+)$/.exec(line);
  if (line.includes('"') && quoted) {
    const [from, to] = [unquote(quoted[1]), unquote(quoted[2])];
    return from.startsWith('a/') && to.startsWith('b/') ? [from.slice(2), to.slice(2)] : null;
  }
  const plain = /^a\/(.+?) b\/(.+)$/.exec(line);
  return plain ? [plain[1], plain[2]] : null;
}

/** `[{file, created, deleted, hunks: [{start, count}], added: [line], removed: [line], context: [line]}]` of a git patch; hunk ranges are base-side. */
export function parsePatch(patch) {
  const files = [];
  for (const chunk of String(patch ?? '').split(/^diff --git /m).slice(1)) {
    const header = headerPaths(chunk.split('\n', 1)[0]);
    if (!header) continue;
    const created = /^new file mode/m.test(chunk);
    const deleted = /^deleted file mode/m.test(chunk);
    const entry = { file: deleted ? header[0] : header[1], created, deleted, hunks: [], added: [], removed: [], context: [] };
    let inHunk = false;
    for (const line of chunk.split('\n')) {
      const hunk = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(line);
      if (hunk) {
        entry.hunks.push({ start: Number(hunk[1]), count: hunk[2] === undefined ? 1 : Number(hunk[2]) });
        inHunk = true;
      } else if (!inHunk) continue;
      else if (line.startsWith('+')) entry.added.push(line.slice(1));
      else if (line.startsWith('-')) entry.removed.push(line.slice(1));
      else if (line.startsWith(' ')) entry.context.push(line.slice(1));
    }
    files.push(entry);
  }
  return files;
}

/** Changed paths of a patch, a deleted file under its old path. */
export const patchPaths = (patch) => [...new Set(parsePatch(patch).map((f) => f.file))];

/** Lines either side a run's hunk may sit off the merged one and still count as the same place: git's default context. */
const SLACK = 3;

/**
 * The share of the merged patch's hunks the run's patch also changes: same file, base ranges within SLACK lines. A
 * created or deleted file has no base place to compare, so its hunks count when the run touched that file at all.
 */
export function hunkRecall(oraclePatch, runPatch) {
  const run = new Map(parsePatch(runPatch).map((f) => [f.file, f]));
  let total = 0;
  let hit = 0;
  for (const file of parsePatch(oraclePatch)) {
    const mine = run.get(file.file);
    for (const hunk of file.hunks) {
      total += 1;
      if (!mine) continue;
      if (file.created || file.deleted) hit += 1;
      else {
        const [from, to] = [hunk.start - SLACK, hunk.start + Math.max(hunk.count, 1) - 1 + SLACK];
        if (mine.hunks.some((h) => h.start <= to && h.start + Math.max(h.count, 1) - 1 >= from)) hit += 1;
      }
    }
  }
  return { recall: total ? hit / total : null, hit, total };
}

/**
 * Compound identifiers (an inner case change or underscore: `orderTotal`, `MAX_RETRIES`). A plain lowercase word is
 * mostly a keyword in any language (`const`, `return`, `self`), which every patch adds and so tells nothing.
 */
const COMPOUND = /[a-z0-9][A-Z]|[A-Za-z0-9]_[A-Za-z0-9]/;
const identifiers = (lines) => new Set(lines.flatMap((line) => line.match(/[A-Za-z_$][\w$]*/g) ?? []).filter((token) => token.length >= 4 && COMPOUND.test(token)));

/** The share of identifiers the merged patch introduces (added, absent from its removed and context lines) that the run's added lines contain too. */
export function identifierRecall(oraclePatch, runPatch) {
  const oracle = parsePatch(oraclePatch);
  const known = identifiers(oracle.flatMap((f) => [...f.removed, ...f.context]));
  const introduced = [...identifiers(oracle.flatMap((f) => f.added))].filter((id) => !known.has(id));
  const runAdded = identifiers(parsePatch(runPatch).flatMap((f) => f.added));
  const hit = introduced.filter((id) => runAdded.has(id)).length;
  return { recall: introduced.length ? hit / introduced.length : null, hit, total: introduced.length };
}
