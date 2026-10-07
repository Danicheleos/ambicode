import path from 'node:path';
import { COMMAND_SPECS } from '#skills/plan/commands';
import { approvedWorkers, runWorker } from '#modules/workers/worker-run';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { AmbicodeError } from '#util/errors';
import { routeTools, taskOf } from '../route/route.ts';
import type { Runtime } from '#types/composition';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const WORKER_RUN_OPTIONS = { values: ['task'], flags: ['json'], positionals: true } as const;

interface WorkerRunOutput { command: 'worker run'; task: string; worker: string; artifact: string; entry: string }

/** No command tail: `worker run` is not one of the commands that advance a route. */
export async function runWorkerCommand(runtime: Runtime, args: ParsedArgs): Promise<WorkerRunOutput> {
  const [id, ...extra] = args.positionals;
  if (id === undefined || extra.length > 0) throw new AmbicodeError('bad-argument', '"worker run" takes exactly one worker id.', { field: 'id' });
  const task = taskOf('worker run', args);
  const approved = await approvedWorkers(runtime, (await resolveTaskDir(runtime, task)).repositoryRoot);
  if (!approved.includes(id)) throw new AmbicodeError('worker-not-approved', `Worker "${id}" is not in workers.approved.`, { details: [`Approved: ${approved.join(', ') || 'none'}. Add the id to workers.approved in the config to allow it.`] });
  const tools = await routeTools(runtime, task);
  const ran = await tools.engine.command(COMMAND_SPECS.worker, { task }, ({ session, context }) =>
    runWorker({ runtime, session, context, runner: runtime.runner, definitions: path.join(runtime.pluginRoot, 'workers') }, { id, task }),
  );
  return { command: 'worker run', task, worker: id, artifact: ran.artifact, entry: ran.entry.id };
}

export const renderWorkerRun = (output: WorkerRunOutput): string => `Worker ${output.worker} ran: ${output.artifact}`;

export const workerRunCommand: CliCommand = {
  name: 'worker run',
  options: WORKER_RUN_OPTIONS,
  run: async (runtime, args) => {
    const output = await runWorkerCommand(runtime, args);
    return { text: renderWorkerRun(output), data: output };
  },
};
