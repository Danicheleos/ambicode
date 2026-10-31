import path from 'node:path';
import { openRepository } from '#platform/git/open';
import { taskExists } from '#platform/ledger/task-unknown';
import { findSessionRepository } from '#platform/git/session-repository';
import { REVIEWS_DIR, TASKS_DIR, type DirKind } from '#types/defaults';
import { AmbicodeError } from '#util/errors';
import { TASK_PATH, mintTaskSlug } from './slug.ts';
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
    plan: path.join(root, 'plan.md'),
    requirements: path.join(root, 'requirements'),
    workers: path.join(root, 'workers'),
    answerBlocked: path.join(root, 'answer-blocked.md'),
  };
}

/** One folder per review, nothing overwritten: `<task>/reviews/<n>`, or `<review run>/<n>` when the run is itself a review. */
export async function nextReviewDirectory(fs: FileSystem, dir: TaskDir): Promise<string> {
  const parent = path.dirname(dir.root) === path.join(dir.repositoryRoot, REVIEWS_DIR) ? dir.root : path.join(dir.root, 'reviews');
  const taken = (await fs.readdir(parent).catch(() => [])).flatMap((entry) => (entry.isDirectory() && /^\d+$/.test(entry.name) ? [Number(entry.name)] : []));
  return path.join(parent, String(Math.max(0, ...taken) + 1));
}

export async function resolveRepository(runtime: Runtime): Promise<{ repositoryRoot: string; where: string }> {
  const found = await findSessionRepository(runtime, runtime.cwd);
  return typeof found === 'string' ? { ...(await openRepository(runtime)), where: '.' } : found;
}

/**
 * The hook prepares for the configured repository below the session directory; a task directory must land there too.
 * Without a `kind` the slug names whichever run directory holds its ledger (a review run, else a task).
 */
export async function resolveTaskDir(runtime: Runtime, slug: string, kind?: DirKind): Promise<TaskDir> {
  const { repositoryRoot, where } = await resolveRepository(runtime);
  if (kind !== undefined) return taskDirFor(repositoryRoot, slug, where, kind);
  const task = taskDirFor(repositoryRoot, slug, where);
  if (await runtime.fs.exists(task.ledger)) return task;
  const review = taskDirFor(repositoryRoot, slug, where, 'review');
  return (await runtime.fs.exists(review.ledger)) ? review : task;
}

/**
 * The task a request names: its first word as a `.ambicode/tasks/<slug>` path, or as the slug or issue key of an
 * existing task; otherwise a new one, named by the text's issue key or slug; null when there is no text.
 */
export async function taskNameFor(runtime: Runtime, kind: DirKind, text: string): Promise<string | null> {
  const first = text.trim().split(/\s+/)[0] ?? '';
  const word = first.toLowerCase();
  const named = TASK_PATH.exec(first)?.[1];
  if (named !== undefined) return named;
  const existing = /^[a-z0-9][a-z0-9-]*$/.test(word) && (await taskExists(runtime.fs, (await resolveTaskDir(runtime, word, kind)).root));
  return existing ? word : mintTaskSlug(text);
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
