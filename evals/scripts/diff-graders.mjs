// Graders over the workspace diff of a finished run. The harness's own graders see only the final message, the trace and fixed file paths: a
// new file with a free name, a file written through several edits or by a Bash command, or one `alembic revision` generated is invisible to a
// trace regex. The diff (`git diff HEAD` with untracked files added, taken by harvest in context.mjs) holds all of them, so a case's
// `diffGraders` are scored here, after harvest, and folded into the run's graders and score the way the harness folds its own.

/**
 * Lines of a unified diff per file, `{ 'path': 'text of the lines' }`. A file header is a `--- ` line immediately followed by a `+++ ` line; a removed
 * line `-- x` or an added line `++ x` alone is content (SQL and Lua comments) and used to open a file named `x`. Removed lines are keyed by the source path.
 */
function linesByFile(diff, marker) {
  const files = {};
  const rows = diff.split('\n');
  let current = null;
  rows.forEach((line, at) => {
    if (line.startsWith('--- ') && rows[at + 1]?.startsWith('+++ ')) {
      const source = line.slice(4).replace(/^a\//, '');
      current = marker === '-' ? (source === '/dev/null' ? null : source) : current;
    } else if (line.startsWith('+++ ') && rows[at - 1]?.startsWith('--- ')) {
      const target = line.slice(4).replace(/^b\//, '');
      if (marker === '+') current = target === '/dev/null' ? null : target;
    } else if (current !== null && line.startsWith(marker)) files[current].push(line.slice(1));
    if (current !== null) files[current] ??= [];
  });
  return Object.fromEntries(Object.entries(files).map(([file, lines]) => [file, lines.join('\n')]));
}

/** Added lines per file of a unified diff: `{ 'path': 'text of the + lines' }`. Deleted files have none. */
export const addedByFile = (diff) => linesByFile(diff, '+');

/** Removed lines per file, the counterpart of addedByFile: `{ 'path': 'text of the - lines' }`. A deleted file has all its lines here. */
export const removedByFile = (diff) => linesByFile(diff, '-');

const inScope = (pattern, files) => Object.entries(files).filter(([file]) => pattern === undefined || new RegExp(pattern).test(file));

/** The text one grader reads: the added lines of every file whose path matches `in` (all files when absent). */
export const textFor = (grader, added) => inScope(grader.in, added).map(([, text]) => text).join('\n');

/** Whether `pattern` matches the text a grader reads: the pooled added lines, or with `perFile` the added lines of any one file in scope. */
const seen = (grader, pattern, added, perFile) => (perFile ? inScope(grader.in, added).some(([, text]) => new RegExp(pattern).test(text)) : new RegExp(pattern).test(textFor(grader, added)));

/**
 * Verdict of one diff grader on a diff. `contains` (default) passes when the pattern is found in the added lines, `not_contains` when it is not.
 * Optional `perFile: true`: the pattern must match the added lines of one file, so a task in one file and a call in another do not add up.
 * Optional `keptIf: { added, removed, in, perFile }` (perFile as above, for `added` only) (a `contains` grader only) is a second way to pass for a behaviour the task may leave exactly as it was: the
 * added lines match `added` AND the behaviour was not removed. In every file matching `keptIf.in` (default: the grader's `in`) it is removed when a removed
 * line matches `removed` and no added line of that same file does (a selection re-added in its file, widened or reformatted, is kept). A diff that removes
 * the behaviour fails, and so does an empty diff (`added` cannot match). Graders without these options are judged and explained exactly as before.
 */
export function gradeOne(grader, diff) {
  const added = addedByFile(diff);
  const found = seen(grader, grader.pattern, added, grader.perFile);
  let passed = (grader.match ?? 'contains') === 'contains' ? found : !found;
  let kept = false;
  if (!passed && grader.keptIf !== undefined && (grader.match ?? 'contains') === 'contains') {
    const removed = removedByFile(diff);
    const gone = inScope(grader.keptIf.in ?? grader.in, removed).some(([file, text]) => new RegExp(grader.keptIf.removed).test(text) && !new RegExp(grader.keptIf.removed).test(added[file] ?? ''));
    kept = seen(grader, grader.keptIf.added, added, grader.keptIf.perFile) && !gone;
    passed = kept;
  }
  const how = kept ? `kept: matched ${grader.keptIf.added} and no removed line matches ${grader.keptIf.removed}` : `${found ? 'matched' : 'no match for'} ${grader.pattern}${grader.perFile ? ' within one file' : ''}`;
  return { name: grader.name, passed, weight: grader.weight ?? 1, explanation: `${how}${grader.in === undefined ? '' : ` in files ${grader.in}`}`, withOnly: false, scored: true, posthoc: true };
}

/** A paid grader the harness skipped for the cost ceiling: it carries passed false, which says nothing about the run. */
export const isSkipped = (grader) => /^skipped: cost ceiling/.test(grader.explanation ?? '');

/**
 * Appends the diff graders' verdicts to a run's graders and recomputes its score as the weighted share of passed graders (how the
 * harness scores: 6 of 7 weights is .857). A run with no diff (no repository found) fails every diff grader: absent is not clean.
 */
export function applyDiffGraders(run, graders, diff) {
  if (!graders || graders.length === 0) return run;
  const verdicts = graders.map((grader) => gradeOne(grader, diff ?? ''));
  run.graders = [...(run.graders ?? []).filter((one) => !one.posthoc), ...verdicts];
  const scored = run.graders.filter((one) => one.scored !== false && !isSkipped(one));
  const total = scored.reduce((sum, one) => sum + one.weight, 0);
  run.score = total === 0 ? 0 : scored.filter((one) => one.passed).reduce((sum, one) => sum + one.weight, 0) / total;
  run.passed = scored.every((one) => one.passed);
  return run;
}
