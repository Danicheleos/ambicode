import type { Runtime } from '../../composition/root.ts';
import { applyRules, discoverRules, revertRule } from '../../policy/rules.ts';
import { ledgerRouteContext } from '../../route/context.ts';
import { runCommandTail } from '../../route/command-tail.ts';
import { AmbicodeError } from '../../util/errors.ts';
import type { ParsedArgs } from '../args.ts';
import { routeTools, taskOf } from './route.ts';

export const RULES_DISCOVER_OPTIONS = { values: ['project'], flags: ['json'], positionals: true } as const;
export const RULES_APPLY_OPTIONS = { values: ['task', 'project'], flags: ['json'] } as const;
export const RULES_REVERT_OPTIONS = { values: ['project'], flags: ['json'], positionals: true } as const;

export interface RulesOutput { command: string; text: string; [field: string]: unknown }

export async function runRulesDiscover(runtime: Runtime, args: ParsedArgs): Promise<RulesOutput> {
  const discovery = await discoverRules(runtime, args.positionals, { project: args.value('project') });
  return { command: 'rules discover', ...discovery };
}

/** The command's own write stands whatever the tail does; the tail prints the next step. */
export async function runRulesApply(runtime: Runtime, args: ParsedArgs): Promise<RulesOutput> {
  const task = taskOf('rules apply', args);
  const tools = await routeTools(runtime, task);
  const session = tools.binding.state === 'bound' ? tools.binding.session : null;
  const applied = await applyRules({ runtime, session, context: ledgerRouteContext({ runtime, routes: tools.routes }) }, { task, project: args.value('project') });
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'rules apply', session: tools.binding });
  return { command: 'rules apply', task, ...applied, ...(next === null ? {} : { next: next.text }), text: `${applied.text}${next === null ? '' : `\n${next.text}`}` };
}

export async function runRulesRevert(runtime: Runtime, args: ParsedArgs): Promise<RulesOutput> {
  const [packId, ...extra] = args.positionals;
  if (packId === undefined || extra.length > 0) throw new AmbicodeError('bad-argument', '"rules revert" takes one pack id: rules revert <pack-id> [--project <id>].', { field: 'pack-id' });
  const moved = await revertRule(runtime, packId, args.value('project'));
  return { command: 'rules revert', packId, ...moved, text: `Moved ${moved.from} back to ${moved.to} and removed it from the project's policyFiles.` };
}

export const renderRules = (output: RulesOutput): string => output.text;
