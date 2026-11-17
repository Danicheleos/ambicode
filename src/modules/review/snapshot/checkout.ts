import path from 'node:path';
import { parseMrUrl } from '#platform/gitlab/glab';
import { Git } from '#platform/git/git';
import { messageOf } from '#util/errors';
import type { Runtime } from '#types/composition';

/** Under steps/, which every route exit deletes, so no exit leaves the files behind. */
export const checkoutDirectory = (taskRoot: string): string => path.join(taskRoot, 'steps', 'checkout');

/** Pins the merge request head as a detached worktree in `checkoutDirectory(root)`. Returns null, or why it is not checked out (the review then runs on the diff alone and says so). */
export async function pinMergeRequestCheckout(runtime: Runtime, git: Git, root: string, url: string, sha: string | null): Promise<string | null> {
  // A leading "-" would be read by git as an option.
  if (sha === null || sha.startsWith('-')) return 'GitLab returned no usable head commit for the merge request';
  const label = `the merge request head ${sha.slice(0, 12)} is not checked out`;
  if ((await git.revParse(sha)) === null) {
    const ref = `refs/merge-requests/${parseMrUrl(url).iid}/head`;
    try {
      await git.fetchRef('origin', ref);
    } catch (error) {
      return `${label}: git fetch origin ${ref} failed: ${messageOf(error)}`;
    }
    if ((await git.revParse(sha)) === null) return `${label}: git fetch origin ${ref} did not bring in ${sha.slice(0, 12)} (the merge request has a newer head)`;
  }
  const directory = checkoutDirectory(root);
  try {
    await git.removeWorktree(directory);
    await runtime.fs.remove(directory);
    await git.addDetachedWorktree(directory, sha);
  } catch (error) {
    return `${label}: git worktree add failed: ${messageOf(error)}`;
  }
  return null;
}

/** Never throws. The route's exit deletes the directory too, but only this unregisters the worktree from git. */
export async function removeMrCheckout(runtime: Runtime, git: Git, root: string): Promise<void> {
  await git.removeWorktree(checkoutDirectory(root));
  await runtime.fs.remove(checkoutDirectory(root)).catch(() => undefined);
}
