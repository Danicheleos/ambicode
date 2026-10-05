import { isAmbicodeError } from '../util/errors.ts';
import type { CommandName } from './context.ts';
import { insideEngine, type Engine, type StepMessage } from './engine.ts';
import { sessionUnbound, type SessionBinding } from './session.ts';

export interface TailDeps {
  engine: Engine;
  /** Where the unbound notice goes: standard error, so a `--json` reader of stdout still gets one document. */
  warn?: (line: string) => void;
}

/**
 * Called once by each evidence-writing wrapper after its own ledger write. No bound session or no open route means
 * the write stands and nothing advances (03-T1). A handler inside the engine never reaches here (03-T3).
 */
export async function runCommandTail(
  deps: TailDeps,
  input: { task: string; cause: CommandName; session: SessionBinding; scratchpadDir?: string },
): Promise<StepMessage | null> {
  if (insideEngine()) throw new Error(`The ${input.cause} tail ran inside the route engine; a handler must not call a command tail.`);
  if (input.session.state === 'unbound') {
    if ((await deps.engine.status(input.task, null)).length === 0) return null;
    const unbound = sessionUnbound(input.session, input.task);
    (deps.warn ?? ((line) => void process.stderr.write(`${line}\n`)))(`${unbound.message} (${input.cause}: the command's own write stands) ${unbound.details.join(' ')}`);
    return null;
  }
  try {
    return await deps.engine.advance({ task: input.task, session: input.session.session, cause: input.cause, ...(input.scratchpadDir === undefined ? {} : { scratchpadDir: input.scratchpadDir }) });
  } catch (error) {
    if (isAmbicodeError(error) && error.code === 'route-not-open') return null;
    throw error;
  }
}
