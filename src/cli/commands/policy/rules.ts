import { applyRules } from '#modules/policy/authoring/rules';
import { COMMAND_SPECS } from '#skills/rules/commands';
import { runCommandTail } from '#harness/engine/engine';
import { routeTools, taskOf } from '../route/route.ts';
import type { Runtime } from '#types/composition';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const RULES_APPLY_OPTIONS = { values: ['task', 'project'], flags: ['json'] } as const;

interface RulesOutput { command: string; text: string; [field: string]: unknown }

/** The command's own write stands whatever the tail does; the tail prints the next step. */
export async function runRulesApply(runtime: Runtime, args: ParsedArgs): Promise<RulesOutput> {
  const task = taskOf('rules apply', args);
  const tools = await routeTools(runtime, task);
  const { applied, binding } = await tools.engine.command(COMMAND_SPECS.rulesApply, { task }, async ({ session, context, binding }) => ({
    binding,
    applied: await applyRules({ runtime, session, context }, { task, project: args.value('project') }),
  }));
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'rules apply', session: binding });
  return { command: 'rules apply', task, ...applied, ...(next === null ? {} : { next: next.text }), text: `${applied.text}${next === null ? '' : `\n${next.text}`}` };
}

export const renderRules = (output: RulesOutput): string => output.text;

export const rulesApplyCommand: CliCommand = {
  name: 'rules apply',
  summary: 'Make the drafts the user accepted live packs (--task).',
  options: RULES_APPLY_OPTIONS,
  run: async (runtime, args) => {
    const output = await runRulesApply(runtime, args);
    return { text: renderRules(output), data: output };
  },
};
