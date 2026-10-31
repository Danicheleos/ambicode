import { recentTasks } from '#modules/evidence/task/recent';
import { resolveRepository } from '#modules/evidence/task/task-dir';
import { AmbicodeError } from '#util/errors';
import { sessionRoutes } from '../session/active-route.ts';
import type { Runtime } from '#types/composition';
import type { RouteRegistry } from '#types/harness';

/** An empty request names no task: the session's latest task of a request-taking route continues, else the user is asked. */
export async function taskForEmptyStart(runtime: Runtime, routes: RouteRegistry, skill: string, session: string): Promise<string> {
  const { repositoryRoot } = await resolveRepository(runtime);
  const mine = (await sessionRoutes(runtime.fs, repositoryRoot, session)).find((route) => routes.route(route.skill)?.needsRequest === true);
  if (mine !== undefined) return mine.task;
  const recent = await recentTasks(runtime.fs, repositoryRoot, routes, 3);
  throw new AmbicodeError('task-needed', `/ambicode:${skill} needs a request or a task, and this session has none to continue. Nothing was created.`, {
    details: [
      recent.length === 0 ? 'There are no tasks yet.' : `Recent tasks:\n${recent.join('\n')}`,
      `Ask the user with AskUserQuestion: ${recent.length === 0 ? '' : 'those tasks as options, plus '}a free answer to describe a new task. Then run: route start ${skill} "<the answer>".`,
    ],
  });
}
