import path from 'node:path';
import { openRepository } from '#platform/git/open';
import { findSessionRepository } from '#platform/git/session-repository';
import { REVIEWS_DIR, TASKS_DIR, type DirKind } from '#types/defaults';
import { AmbicodeError } from '#util/errors';
import type { Runtime } from '#types/composition';
import { LEDGER_FILE, type TaskDir } from '#types/modules/evidence';
import type { FileSystem } from '#types/platform/ports';

/** The only place that joins `TASKS_DIR` or `REVIEWS_DIR` and a slug. */
export function taskDirFor(repositoryRoot: string, slug: string, where = '.', kind: DirKind = 'task'): TaskDir {
  const base = kind === 'review' ? REVIEWS_DIR : TASKS_DIR;
  if (slug === '' || slug === '.' || /[\\/]|\.\./.test(slug)) {
    throw new AmbicodeError('bad-argument', `"${slug}" is not a run slug: it must name one directory under ${base}.`, { field: 'task' });
  }
  const root = path.join(repositoryRoot, base, slug);
  const steps = path.join(root, 'steps');
  return {
    slug,
    root,
    repositoryRoot,
    where,
    ledger: path.join(root, LEDGER_FILE),
    steps,
    planBody: path.join(steps, 'plan-body.md'),
    requirements: path.join(root, 'requirements'),
    workers: path.join(root, 'workers'),
    stopCheck: path.join(root, 'stop-check.md'),
    answerBlocked: path.join(root, 'answer-blocked.md'),
  };
}

/**
 * The hook prepares for the configured repository below the session directory; a task directory must land there too.
 * Without a `kind` the slug names whichever run directory holds its ledger (a review run, else a task).
 */
export async function resolveTaskDir(runtime: Runtime, slug: string, kind?: DirKind): Promise<TaskDir> {
  const found = await findSessionRepository(runtime, runtime.cwd);
  const { repositoryRoot, where } = typeof found === 'string' ? { ...(await openRepository(runtime)), where: '.' } : found;
  if (kind !== undefined) return taskDirFor(repositoryRoot, slug, where, kind);
  const task = taskDirFor(repositoryRoot, slug, where);
  if (await runtime.fs.exists(task.ledger)) return task;
  const review = taskDirFor(repositoryRoot, slug, where, 'review');
  return (await runtime.fs.exists(review.ledger)) ? review : task;
}

/**
 * Where a `--task` command runs: the repository holding that task's ledger when the shell sits
 * outside it, as it does when the session starts above the configured repository.
 */
export async function taskWorkingDirectory(runtime: Runtime, slug: string): Promise<string> {
  const dir = await resolveTaskDir(runtime, slug).catch(() => null);
  if (dir === null || !(await runtime.fs.exists(dir.ledger))) return runtime.cwd;
  const real = (value: string) => runtime.fs.realpath(value).catch(() => value);
  const relative = path.relative(await real(dir.repositoryRoot), await real(runtime.cwd));
  return relative.startsWith('..') || path.isAbsolute(relative) ? dir.repositoryRoot : runtime.cwd;
}

/** `--from` names the task's own plan body and nothing else: not another file, another task or a link to one. */
export async function resolveFrom(fs: FileSystem, dir: TaskDir, from: string): Promise<string> {
  const refuse = (why: string): AmbicodeError =>
    new AmbicodeError('bad-argument', `--from must be steps/plan-body.md of this task; ${why}.`, { field: 'from' });
  const realRoot = await fs.realpath(dir.root).catch(() => dir.root);
  const expected = path.join(realRoot, 'steps', 'plan-body.md');
  if (path.isAbsolute(from)) {
    if ((await fs.realpath(from).catch(() => null)) !== expected) throw refuse('that path is something else');
  } else if (path.resolve(dir.root, from) !== dir.planBody) {
    throw refuse('that path is something else');
  }
  const stats = await fs.lstat(path.isAbsolute(from) ? from : dir.planBody).catch(() => null);
  if (stats === null) throw refuse('the file does not exist');
  if (stats.isSymbolicLink() || (await fs.realpath(dir.planBody)) !== expected) throw refuse('it is a symbolic link');
  return dir.planBody;
}
