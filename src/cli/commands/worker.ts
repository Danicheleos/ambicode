import path from 'node:path';
import type { Runtime } from '../../composition/root.ts';
import { ledgerRouteContext } from '../../route/context.ts';
import { runWorker } from '../../workers/worker-run.ts';
import { AmbicodeError } from '../../util/errors.ts';
import type { ParsedArgs } from '../args.ts';
import { routeTools, taskOf } from './route.ts';

export const WORKER_RUN_OPTIONS = { values: ['task'], flags: ['json'], positionals: true } as const;

export interface WorkerRunOutput { command: 'worker run'; task: string; worker: string; artifact: string; entry: string }

/** No command tail: `worker run` is not one of the commands that advance a route. */
export async function runWorkerCommand(runtime: Runtime, args: ParsedArgs): Promise<WorkerRunOutput> {
  const [id, ...extra] = args.positionals;
  if (id === undefined || extra.length > 0) throw new AmbicodeError('bad-argument', '"worker run" takes exactly one worker id.', { field: 'id' });
  const task = taskOf('worker run', args);
  const tools = await routeTools(runtime, task);
  const session = tools.binding.state === 'bound' ? tools.binding.session : null;
  const ran = await runWorker({ runtime, session, context: ledgerRouteContext({ runtime, routes: tools.routes }), runner: runtime.runner, definitions: path.join(runtime.pluginRoot, 'workers') }, { id, task });
  return { command: 'worker run', task, worker: id, artifact: ran.artifact, entry: ran.entry.id };
}

export const renderWorkerRun = (output: WorkerRunOutput): string => `Worker ${output.worker} ran: ${output.artifact}`;
