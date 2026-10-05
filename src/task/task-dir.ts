import path from 'node:path';
import { openRepository, type Runtime } from '../composition/root.ts';
import { findSessionRepository } from '../composition/session-repository.ts';
import { REVIEWS_LEAF, TASKS_DIR } from '../config/defaults.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import { AmbicodeError } from '../util/errors.ts';
import { LEDGER_FILE } from './ledger.ts';

export interface TaskDir {
  slug: string;
  root: string;
  repositoryRoot: string;
  /** The directory the repository sits in, relative to the session: `.` or its name. */
  where: string;
  ledger: string;
  steps: string;
  planBody: string;
  requirements: string;
  workers: string;
  reviews: string;
  stopCheck: string;
}

/** The only place that joins `TASKS_DIR` and a slug. */
export function taskDirFor(repositoryRoot: string, slug: string, where = '.'): TaskDir {
  if (slug === '' || slug === '.' || /[\\/]|\.\./.test(slug)) {
    throw new AmbicodeError('bad-argument', `"${slug}" is not a task slug: it must name one directory under ${TASKS_DIR}.`, { field: 'task' });
  }
  const root = path.join(repositoryRoot, TASKS_DIR, slug);
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
    reviews: path.join(root, REVIEWS_LEAF),
    stopCheck: path.join(root, 'stop-check.md'),
  };
}

/** The hook prepares for the configured repository below the session directory; a task directory must land there too. */
export async function resolveTaskDir(runtime: Runtime, slug: string): Promise<TaskDir> {
  const found = await findSessionRepository(runtime, runtime.cwd);
  const { repositoryRoot, where } = typeof found === 'string' ? { ...(await openRepository(runtime)), where: '.' } : found;
  return taskDirFor(repositoryRoot, slug, where);
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
