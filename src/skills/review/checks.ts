import { checkKeys, runCheckOnly } from '#modules/checks/run/check-command';
import { checkApprovalKey } from '#modules/checks/selection/authorize';
import { groupByProject } from '#modules/review/bundle/bundle';
import { openWorkspace } from '#modules/config/workspace';
import { isAmbicodeError } from '#util/errors';
import type { DiffFile } from '#types/platform/git';
import type { HandlerInput } from '#types/harness';
import type { LedgerEntry } from '#types/modules/evidence';

/** A format check changes files, so it is not verification; the model's `checks.runnable` list leaves it out for the same reason. */
const FORMAT = 'format';

/**
 * Runs every configured check that has a file-scoped form on the files the review covers, recording a `check` entry each
 * (the model ran 10 calls and ~34 s of tests per review-regression run, and 86 of 107 runs ran tests outside `check`).
 * `notes` are result omissions: a check that did not run is a gap, never an empty result. `waiting` are consent questions.
 */
export async function runReviewChecks(input: HandlerInput, files: readonly DiffFile[], chain: readonly LedgerEntry[]): Promise<{ notes: string[]; waiting: { key: string; files: string[] }[] }> {
  const { view } = input;
  const deps = { runtime: input.runtime, session: view.session, context: input.context, ledger: input.ledger };
  const workspace = await openWorkspace(input.runtime);
  const ran = new Set(chain.filter((entry) => entry.kind === 'check' && entry['route'] === view.routeId).map((entry) => String(entry['key'])));
  const notes: string[] = [];
  const waiting: { key: string; files: string[] }[] = [];
  for (const { project, changed } of groupByProject(workspace, files)) {
    // A deleted file has nothing for a file command to open.
    const paths = changed.flatMap((change) => (change.newPath === null ? [] : [change.newPath]));
    if (paths.length === 0) continue;
    for (const { key: name } of checkKeys(project).filter((entry) => entry.file && entry.key !== FORMAT)) {
      const key = checkApprovalKey(project.id, name);
      // An answered consent question reruns the step: what already ran is not run twice.
      if (ran.has(key)) continue;
      try {
        const outcome = await runCheckOnly(deps, { task: view.task, name, project: project.id, files: paths, phase: 'green', approve: [], decline: [], raise: false });
        if (outcome.outcome === 'waiting') waiting.push({ key, files: paths });
        else if (outcome.outcome === 'declined') notes.push(`${key} was not run: declined, so it verified nothing.`);
        else if (outcome.outcome === 'not-run') notes.push(`${key} was not run: ${outcome.status} (${outcome.detail}), so it verified nothing.`);
        else if (outcome.entry['exit'] !== 0) notes.push(`${key} failed with exit ${String(outcome.entry['exit'])} on ${paths.join(' ')}: a failure, not a pass (section 3).`);
      } catch (error) {
        if (!isAmbicodeError(error)) throw error;
        notes.push(`${key} was not run: ${error.code}: ${error.message}`);
      }
    }
  }
  return { notes, waiting };
}
