// Graders over the workspace diff of a finished run. The harness's own graders see only the final message, the trace and fixed file paths: a
// new file with a free name, a file written through several edits or by a Bash command, or one `alembic revision` generated is invisible to a
// trace regex. The diff (`git diff HEAD` with untracked files added, taken by harvest in context.mjs) holds all of them, so a case's
// `diffGraders` are scored here, after harvest, and folded into the run's graders and score the way the harness folds its own.

/** Added lines per file of a unified diff: `{ 'path': 'text of the + lines' }`. Deleted files have none. */
export function addedByFile(diff) {
  const files = {};
  let current = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const target = line.slice(4).replace(/^b\//, '');
      current = target === '/dev/null' ? null : target;
      if (current !== null) files[current] ??= [];
    } else if (current !== null && line.startsWith('+') && !line.startsWith('+++')) files[current].push(line.slice(1));
  }
  return Object.fromEntries(Object.entries(files).map(([file, lines]) => [file, lines.join('\n')]));
}

/** The text one grader reads: the added lines of every file whose path matches `in` (all files when absent). */
export const textFor = (grader, added) => Object.entries(added).filter(([file]) => grader.in === undefined || new RegExp(grader.in).test(file)).map(([, text]) => text).join('\n');

/** Verdict of one diff grader on a diff. `contains` (default) passes when the pattern is found, `not_contains` when it is not. */
export function gradeOne(grader, diff) {
  const found = new RegExp(grader.pattern).test(textFor(grader, addedByFile(diff)));
  const passed = (grader.match ?? 'contains') === 'contains' ? found : !found;
  return { name: grader.name, passed, weight: grader.weight ?? 1, explanation: `${found ? 'matched' : 'no match for'} ${grader.pattern}${grader.in === undefined ? '' : ` in files ${grader.in}`}`, withOnly: false, scored: true, posthoc: true };
}

/**
 * Appends the diff graders' verdicts to a run's graders and recomputes its score as the weighted share of passed graders (how the
 * harness scores: 6 of 7 weights is .857). A run with no diff (no repository found) fails every diff grader: absent is not clean.
 */
export function applyDiffGraders(run, graders, diff) {
  if (!graders || graders.length === 0) return run;
  const verdicts = graders.map((grader) => gradeOne(grader, diff ?? ''));
  run.graders = [...(run.graders ?? []).filter((one) => !one.posthoc), ...verdicts];
  const scored = run.graders.filter((one) => one.scored !== false);
  const total = scored.reduce((sum, one) => sum + one.weight, 0);
  run.score = total === 0 ? 0 : scored.filter((one) => one.passed).reduce((sum, one) => sum + one.weight, 0) / total;
  run.passed = scored.every((one) => one.passed);
  return run;
}
